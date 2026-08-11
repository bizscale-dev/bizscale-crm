import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import { parseGoogleSheetUrl, fetchGoogleSheetRows } from '@/lib/googleSheets';
import { logSyncRun } from '@/lib/syncLog';

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
 * Same approach as /api/sync-completed-links: the sheet holds a running
 * cumulative total per client, so new progress = sheet total minus everything
 * already recorded across this client/post-type's due rows — applied to the
 * oldest still-incomplete ("Pending") row first, then today's, so a Pending
 * task actually clears once enough real work lands in the sheet.
 */

export async function POST(request) {
  // Logs the failure to sync_logs (visible on /admin/link-sync) before returning it —
  // early-exit failures like "no sheet URL configured" are exactly what that page needs
  // to surface, since they'd otherwise only show up in Vercel's function logs.
  const fail = async (error, status = 400) => {
    await logSyncRun('webseo-completed-links', 'error', error);
    return Response.json({ error }, { status });
  };

  try {
    const db = await getDb();
    const campaign = await getActiveCampaign();

    if (!campaign) {
      return await fail('No active campaign');
    }

    const body = await request.json().catch(() => ({}));
    let sheetUrl = body.sheetUrl;

    if (!sheetUrl) {
      const settings = await db.prepare("SELECT value FROM settings WHERE key = ?").get('web_seo_completed_links_sheet_url');
      sheetUrl = settings?.value;
    }

    if (!sheetUrl) {
      return await fail('No Google Sheet URL configured. Please set it in the Sync Completed Links page first.');
    }

    const sheetInfo = parseGoogleSheetUrl(sheetUrl);
    if (!sheetInfo) {
      return await fail('Invalid Google Sheet URL format');
    }

    let rows;
    try {
      rows = await fetchGoogleSheetRows(sheetInfo.exportUrl);
    } catch (err) {
      return await fail(`Failed to fetch sheet: ${err.message}. Make sure the sheet is publicly accessible.`);
    }

    if (rows.length < 2) {
      return await fail('Sheet has no data rows');
    }

    const headers = rows[0].map(h => h.trim());
    console.log('[WEBSEO SYNC] Headers found:', headers);

    const clientNameIdx = headers.findIndex(h => h.toLowerCase().includes('client'));
    const web2Idx = headers.findIndex(h => h.toLowerCase().includes('web') && h.toLowerCase().includes('2'));
    const guestPostIdx = headers.findIndex(h => h.toLowerCase().includes('guest'));

    if (clientNameIdx === -1) {
      return await fail('Could not find "Client Name" column. Found columns: ' + headers.join(', '));
    }

    if (web2Idx === -1 || guestPostIdx === -1) {
      return await fail('Missing Web 2.0 or Guest Post column. Found: ' + headers.join(', '));
    }

    const postTypeMap = { web2: web2Idx, guestpost: guestPostIdx };

    const today = new Date().toISOString().split('T')[0];

    let syncedCount = 0;
    const syncedClients = [];
    const errors = [];

    const dbClients = await db.prepare(`
      SELECT id, name, business_name, assigned_associate_id FROM web_clients WHERE campaign_id = ? AND is_active = 1
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

        // Every due row for this client/post type (today and any still-overdue
        // "Pending" ones), oldest first — new progress pays down the oldest
        // unfinished debt before crediting today, so a Pending task actually
        // clears once enough real work lands in the sheet (see sync-completed-links
        // for the full rationale — the sync used to only ever touch today's row,
        // so an overdue day could never be caught up automatically).
        const dueTasks = await db.prepare(`
          SELECT id, task_date, target_count, completed_count
          FROM webseo_tasks
          WHERE campaign_id = ? AND client_id = ? AND post_type = ? AND task_date <= ?
          ORDER BY task_date ASC
        `).all(campaign.id, client.id, postType, today);

        if (dueTasks.length === 0) continue;

        const alreadyRecorded = dueTasks.reduce((sum, t) => sum + t.completed_count, 0);
        let newProgress = Math.max(0, sheetCompletedCount - alreadyRecorded);

        const updates = [];
        for (const task of dueTasks) {
          if (newProgress <= 0) break;
          const room = Math.max(0, task.target_count - task.completed_count);
          if (room <= 0) continue;
          const applied = Math.min(room, newProgress);
          updates.push({ id: task.id, newCompleted: task.completed_count + applied });
          newProgress -= applied;
        }

        // Leftover once every due row is already at its own target means the sheet
        // shows more than everything assigned so far — attribute it to today
        // specifically (allowed to exceed today's target), same as the old
        // "overachievement" behavior, rather than discarding it.
        if (newProgress > 0) {
          const todayTask = dueTasks.find(t => t.task_date === today);
          if (todayTask) {
            const existingUpdate = updates.find(u => u.id === todayTask.id);
            if (existingUpdate) {
              existingUpdate.newCompleted += newProgress;
            } else {
              updates.push({ id: todayTask.id, newCompleted: todayTask.completed_count + newProgress });
            }
          }
        }

        for (const { id, newCompleted } of updates) {
          await db.prepare('UPDATE webseo_tasks SET completed_count = ? WHERE id = ?').run(newCompleted, id);
          syncedCount++;
        }

        if (updates.length > 0) {
          console.log(`[WEBSEO SYNC] Updated ${client.business_name} - ${postType}: ${updates.length} row(s) (sheet: ${sheetCompletedCount}, already recorded: ${alreadyRecorded})`);
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

    const summary = `Synced ${syncedCount} completed Web SEO task records from ${syncedClients.length} clients`;
    await logSyncRun('webseo-completed-links', 'success', summary, {
      syncedCount,
      clientCount: syncedClients.length,
      errors: errors.length > 0 ? errors : undefined,
    });

    return Response.json({
      success: true,
      message: summary,
      syncedCount,
      syncedClients,
      errors: errors.length > 0 ? errors : undefined,
      date: today
    });
  } catch (err) {
    console.error('[WEBSEO SYNC] Error:', err);
    await logSyncRun('webseo-completed-links', 'error', err.message);
    return Response.json({ error: `Sync error: ${err.message}` }, { status: 500 });
  }
}

export async function GET(request) {
  return POST(request);
}
