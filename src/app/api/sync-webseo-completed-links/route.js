import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import { parseGoogleSheetUrl, fetchGoogleSheetRows } from '@/lib/googleSheets';

// 60s is the max allowed on Vercel's Hobby plan — see src/app/api/cron/daily-sync/route.js
// for why this matters (a killed function fails silently with no error surfaced).
export const maxDuration = 60;

/**
 * POST /api/sync-webseo-completed-links
 *
 * Syncs completed Web SEO Associate tasks from a Google Sheet into webseo_tasks.
 * Expected sheet format:
 * - Column A: Client Name
 * - Column B: Sheet URL
 * - Column C: Total
 * - Column D: Web 2.0
 * - Column E: Guest Post
 * - Column F: Last Update
 *
 * Same delta approach as /api/sync-completed-links: the sheet holds a running
 * cumulative total per client, so today's completed_count = today's sheet total
 * minus yesterday's sheet total (i.e. yesterday's webseo_tasks.completed_count),
 * not the raw sheet number.
 */

export async function POST(request) {
  try {
    const db = await getDb();
    const campaign = await getActiveCampaign();

    if (!campaign) {
      return Response.json({ error: 'No active campaign' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    let sheetUrl = body.sheetUrl;

    if (!sheetUrl) {
      const settings = await db.prepare("SELECT value FROM settings WHERE key = ?").get('web_seo_completed_links_sheet_url');
      sheetUrl = settings?.value;
    }

    if (!sheetUrl) {
      return Response.json({
        error: 'No Google Sheet URL configured. Please set it in the Sync Completed Links page first.'
      }, { status: 400 });
    }

    const sheetInfo = parseGoogleSheetUrl(sheetUrl);
    if (!sheetInfo) {
      return Response.json({ error: 'Invalid Google Sheet URL format' }, { status: 400 });
    }

    let rows;
    try {
      rows = await fetchGoogleSheetRows(sheetInfo.exportUrl);
    } catch (err) {
      return Response.json({
        error: `Failed to fetch sheet: ${err.message}. Make sure the sheet is publicly accessible.`
      }, { status: 400 });
    }

    if (rows.length < 2) {
      return Response.json({ error: 'Sheet has no data rows' }, { status: 400 });
    }

    const headers = rows[0].map(h => h.trim());
    console.log('[WEBSEO SYNC] Headers found:', headers);

    const clientNameIdx = headers.findIndex(h => h.toLowerCase().includes('client'));
    const web2Idx = headers.findIndex(h => h.toLowerCase().includes('web') && h.toLowerCase().includes('2'));
    const guestPostIdx = headers.findIndex(h => h.toLowerCase().includes('guest'));

    if (clientNameIdx === -1) {
      return Response.json({
        error: 'Could not find "Client Name" column. Found columns: ' + headers.join(', ')
      }, { status: 400 });
    }

    if (web2Idx === -1 || guestPostIdx === -1) {
      return Response.json({
        error: 'Missing Web 2.0 or Guest Post column. Found: ' + headers.join(', ')
      }, { status: 400 });
    }

    const postTypeMap = { web2: web2Idx, guestpost: guestPostIdx };

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    let syncedCount = 0;
    const syncedClients = [];
    const errors = [];

    const dbClients = await db.prepare(`
      SELECT id, name, business_name, assigned_associate_id FROM web_clients WHERE campaign_id = ?
    `).all(campaign.id);

    console.log(`[WEBSEO SYNC] Found ${dbClients.length} web clients in database`);

    // Live, all-time total per associate straight from the sheet — summed across every
    // one of their clients (not just ones scheduled today), so an associate with
    // pre-existing sheet history sees their real total immediately rather than waiting
    // for the daily rotation to eventually reach every client.
    const lifetimeTotalByAssociate = {};

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const clientName = (row[clientNameIdx] || '').trim();
      if (!clientName) continue;

      let client = dbClients.find(c => c.name === clientName || c.business_name === clientName);

      if (!client) {
        client = dbClients.find(c =>
          c.business_name.toLowerCase().includes(clientName.toLowerCase()) ||
          clientName.toLowerCase().includes(c.business_name.toLowerCase())
        );
      }

      if (!client) {
        errors.push(`Client "${clientName}" not found in campaign`);
        continue;
      }

      const clientResult = { name: clientName, web2: 0, guestpost: 0 };

      for (const [postType, colIdx] of Object.entries(postTypeMap)) {
        if (colIdx === -1 || colIdx >= row.length) continue;

        const sheetCompletedCount = parseInt(row[colIdx] || '0', 10);
        if (isNaN(sheetCompletedCount) || sheetCompletedCount < 0) {
          continue;
        }

        clientResult[postType] = sheetCompletedCount;

        // No task scheduled for this client/type today (not their batch's visit day
        // this cycle) — nothing to update, skip silently.
        const todayTask = await db.prepare(`
          SELECT id, target_count, completed_count
          FROM webseo_tasks
          WHERE campaign_id = ? AND client_id = ? AND post_type = ? AND task_date = ?
          LIMIT 1
        `).get(campaign.id, client.id, postType, today);

        if (!todayTask) continue;

        const yesterdayTask = await db.prepare(`
          SELECT completed_count
          FROM webseo_tasks
          WHERE campaign_id = ? AND client_id = ? AND post_type = ? AND task_date = ?
          LIMIT 1
        `).get(campaign.id, client.id, postType, yesterdayStr);

        const yesterdayCompleted = yesterdayTask?.completed_count || 0;
        const todaysProgress = Math.max(0, sheetCompletedCount - yesterdayCompleted);

        if (todaysProgress !== todayTask.completed_count) {
          await db.prepare('UPDATE webseo_tasks SET completed_count = ? WHERE id = ?').run(todaysProgress, todayTask.id);
          syncedCount++;
          console.log(`[WEBSEO SYNC] Updated ${client.business_name} - ${postType}: ${todaysProgress} (sheet: ${sheetCompletedCount}, yesterday: ${yesterdayCompleted})`);
        }
      }

      syncedClients.push(clientResult);

      if (client.assigned_associate_id) {
        const clientTotal = clientResult.web2 + clientResult.guestpost;
        lifetimeTotalByAssociate[client.assigned_associate_id] =
          (lifetimeTotalByAssociate[client.assigned_associate_id] || 0) + clientTotal;
      }
    }

    for (const [associateId, total] of Object.entries(lifetimeTotalByAssociate)) {
      await db.prepare('UPDATE users SET lifetime_completed_links = ? WHERE id = ?').run(total, associateId);
    }

    console.log(`[WEBSEO SYNC] Complete: ${syncedCount} records synced from ${syncedClients.length} clients`);

    return Response.json({
      success: true,
      message: `Synced ${syncedCount} completed Web SEO task records from ${syncedClients.length} clients`,
      syncedCount,
      syncedClients,
      errors: errors.length > 0 ? errors : undefined,
      date: today
    });
  } catch (err) {
    console.error('[WEBSEO SYNC] Error:', err);
    return Response.json({ error: `Sync error: ${err.message}` }, { status: 500 });
  }
}

export async function GET(request) {
  return POST(request);
}
