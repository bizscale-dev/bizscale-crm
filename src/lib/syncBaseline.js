import { getDb } from './db';
import { parseGoogleSheetUrl, fetchGoogleSheetRows } from './googleSheets';

// The Completed Links sheet keeps LIFETIME totals per client and link type, and the sync
// credits whatever the sheet shows beyond what's recorded on the client's due rows. When a
// client moves to a new funnel month the new month's tasks must start from 0, so we
// remember how much of the sheet's total was already "used up" at that moment (the
// baseline) and the sync only credits growth beyond it. See sync-completed-links/route.js.

const LINK_TYPES = ['web2', 'guestpost', 'pdf', 'profile', 'citation', 'image'];

const columnFor = (headers) => ({
  client: headers.findIndex((h) => h.includes('client')),
  web2: headers.findIndex((h) => h.includes('web') && h.includes('2')),
  guestpost: headers.findIndex((h) => h.includes('guest')),
  pdf: headers.findIndex((h) => h.includes('pdf')),
  profile: headers.findIndex((h) => h.includes('profile')),
  citation: headers.findIndex((h) => h.includes('citation') || h.includes('directory')),
  image: headers.findIndex((h) => h.includes('image')),
});

// Records baseline = sheet total - already-recorded completions, per link type, for one
// client. Call it at the moment a client starts a new month's tasks, BEFORE any of that
// month's progress counts. Never throws: a sheet problem must not block the move itself.
export async function captureSyncBaseline(clientId) {
  try {
    const db = await getDb();
    const client = await db.prepare('SELECT id, name FROM clients WHERE id = ?').get(clientId);
    if (!client) return { ok: false, error: 'Client not found' };
    const setting = await db.prepare("SELECT value FROM settings WHERE key = 'completed_links_sheet_url'").get();
    const parsed = setting?.value ? parseGoogleSheetUrl(setting.value) : null;
    if (!parsed) return { ok: false, error: 'No completed-links sheet configured' };

    const rows = await fetchGoogleSheetRows(parsed.exportUrl);
    const cols = columnFor(rows[0].map((h) => h.trim().toLowerCase()));
    const name = client.name.toLowerCase();
    const row = rows.slice(1).find((r) => {
      const n = (r[cols.client] || '').trim().toLowerCase();
      return n && (n === name || n.includes(name) || name.includes(n));
    });
    if (!row) return { ok: false, error: 'Client not found on the completed-links sheet' };

    const today = new Date().toISOString().split('T')[0];
    const baselines = {};
    for (const lt of LINK_TYPES) {
      if (cols[lt] === -1) continue;
      const sheet = parseInt(row[cols[lt]] || '0', 10) || 0;
      const rec = await db.prepare(
        'SELECT COALESCE(SUM(completed_count), 0) AS s FROM seo_tasks WHERE client_id = ? AND link_type = ? AND task_date <= ?'
      ).get(clientId, lt, today);
      const baseline = Math.max(0, sheet - Number(rec.s));
      baselines[lt] = baseline;
      await db.prepare(
        'INSERT INTO sync_baselines (client_id, link_type, baseline) VALUES (?, ?, ?) ON CONFLICT(client_id, link_type) DO UPDATE SET baseline = excluded.baseline'
      ).run(clientId, lt, baseline);
    }
    return { ok: true, baselines };
  } catch (err) {
    console.error('[syncBaseline] failed for client', clientId, err.message);
    return { ok: false, error: err.message };
  }
}
