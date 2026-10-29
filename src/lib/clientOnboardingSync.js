import { getDb } from '@/lib/db';
import { parseGoogleSheetUrl } from '@/lib/googleSheets';
import { createClientOnboardingTasks } from '@/lib/clientOnboardingTasks';

// Daily check of the SEO clients sheet for brand-new clients. Deliberately not
// tied to the clients table, campaigns or task generation: it only remembers
// which sheet clients it has already handled (client_onboarding_log) and gives
// each new one its onboarding tasks, once.

async function getAccessToken(db) {
  const tok = await db.prepare(`
    SELECT access_token, refresh_token, expires_at FROM google_oauth_tokens
    WHERE user_id IS NULL ORDER BY updated_at DESC LIMIT 1
  `).get();
  if (!tok) throw new Error('Google is not authorized — connect the sheet first');

  const expired = tok.expires_at && new Date(tok.expires_at) < new Date();
  if (!expired && tok.access_token) return tok.access_token;
  if (!tok.refresh_token) throw new Error('Google token expired and there is no refresh token');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: tok.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error('Failed to refresh the Google access token');
  const accessToken = (await res.json()).access_token;
  await db.prepare(`
    UPDATE google_oauth_tokens SET access_token = ?, expires_at = datetime('now', '+1 hour') WHERE user_id IS NULL
  `).run(accessToken);
  return accessToken;
}

// [{ name, supportNumber }] for every client row on the sheet (same columns as
// the main client sync: C = name, G = Support 1-10).
async function readSheetClients(db) {
  const setting = await db.prepare("SELECT value FROM settings WHERE key = 'google_sheets_url'").get();
  if (!setting) throw new Error('Google Sheets URL is not configured');
  const parsed = parseGoogleSheetUrl(setting.value);
  if (!parsed) throw new Error('Invalid Google Sheets URL');

  const accessToken = await getAccessToken(db);
  const headers = { Authorization: `Bearer ${accessToken}` };

  let sheetName = 'Active Clients';
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${parsed.spreadsheetId}`, { headers });
  if (metaRes.ok) {
    const sheets = (await metaRes.json()).sheets || [];
    if (sheets.length > 0 && !sheets.some((s) => s.properties.title === 'Active Clients')) sheetName = sheets[0].properties.title;
  }

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${parsed.spreadsheetId}/values/'${sheetName}'!A1:Z1000?majorDimension=ROWS`,
    { headers },
  );
  if (!res.ok) throw new Error(`Failed to read the sheet (${res.status})`);
  const rows = (await res.json()).values || [];

  const clients = [];
  for (let i = 1; i < rows.length; i++) {
    const name = rows[i][2]?.trim();
    if (name) clients.push({ name, supportNumber: parseInt(rows[i][6], 10) || null });
  }
  return clients;
}

export async function runClientOnboardingSync() {
  const db = await getDb();
  const sheetClients = await readSheetClients(db);

  // First ever run: every client already in the app counts as handled, so only
  // genuinely new clients get tasks (not the whole existing roster).
  const { c } = await db.prepare('SELECT COUNT(*) AS c FROM client_onboarding_log').get();
  if (Number(c) === 0) {
    await db.prepare(`
      INSERT OR IGNORE INTO client_onboarding_log (name_key, client_name, tasks_created)
      SELECT lower(trim(name)), trim(name), 0 FROM clients WHERE name IS NOT NULL AND trim(name) != ''
    `).run();
  }

  const result = { sheetClients: sheetClients.length, newClients: [], waitingForSupport: [], tasksCreated: 0 };
  for (const client of sheetClients) {
    const key = client.name.toLowerCase();
    const seen = await db.prepare('SELECT 1 FROM client_onboarding_log WHERE name_key = ?').get(key);
    if (seen) continue;

    // No Support number yet means we can't tell whose client it is — leave it
    // unhandled so tomorrow's run picks it up once the sheet is filled in.
    if (client.supportNumber == null) {
      result.waitingForSupport.push(client.name);
      continue;
    }

    // Claim the client first so two overlapping runs can't both create its tasks.
    const claim = await db.prepare(`
      INSERT OR IGNORE INTO client_onboarding_log (name_key, client_name, support_number, tasks_created) VALUES (?, ?, ?, 0)
    `).run(key, client.name, client.supportNumber);
    if (!claim.changes) continue;

    const created = await createClientOnboardingTasks(db, { clientName: client.name, supportNumber: client.supportNumber });
    await db.prepare('UPDATE client_onboarding_log SET tasks_created = ? WHERE name_key = ?').run(created, key);
    result.newClients.push({ name: client.name, supportNumber: client.supportNumber, tasks: created });
    result.tasksCreated += created;
  }
  return result;
}
