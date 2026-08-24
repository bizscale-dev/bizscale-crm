import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import { parseGoogleSheetUrl, fetchGoogleSheetRows, parseCsv } from '@/lib/googleSheets';
import { logSyncRun } from '@/lib/syncLog';

// 60s is the max allowed on Vercel's Hobby plan — see src/app/api/cron/daily-sync/route.js
// for why this matters (a killed function fails silently with no error surfaced).
export const maxDuration = 60;

/**
 * POST /api/sync-completed-links
 * 
 * Syncs completed links from Google Sheet to update seo_tasks completed_count
 * Expected sheet format (Sheet1):
 * - Column A: Client Name
 * - Column B: Sheet URL
 * - Column C: Total
 * - Column D: Web 2.0
 * - Column E: Guest Post
 * - Column F: PDF Submission
 * - Column G: Bookmarking
 * - Column H: Q/A
 * - Column I: Profile Creation
 * - Column J: Image Submissions
 * - Column K: Citations/Directory
 * - Column L: Other
 * - Column M: Last Update
 */

export async function POST(request) {
  // Logs the failure to sync_logs (visible on /admin/link-sync) before returning it —
  // early-exit failures like "no sheet URL configured" are exactly what that page needs
  // to surface, since they'd otherwise only show up in Vercel's function logs.
  const fail = async (error, status = 400) => {
    await logSyncRun('completed-links', 'error', error);
    return Response.json({ error }, { status });
  };

  try {
    const db = await getDb();
    const campaign = await getActiveCampaign();

    if (!campaign) {
      return await fail('No active campaign');
    }

    // Get the Google Sheet URL from request body or settings
    const body = await request.json().catch(() => ({}));
    let sheetUrl = body.sheetUrl;

    if (!sheetUrl) {
      // Prefer the dedicated Completed Links sheet URL; fall back to the general
      // client-assignment sheet URL for backward compatibility if it isn't set.
      const completedLinksSettings = await db.prepare("SELECT value FROM settings WHERE key = ?").get('completed_links_sheet_url');
      sheetUrl = completedLinksSettings?.value;

      if (!sheetUrl) {
        const settings = await db.prepare("SELECT value FROM settings WHERE key = ?").get('google_sheets_url');
        sheetUrl = settings?.value;
      }
    }

    if (!sheetUrl) {
      return await fail('No Google Sheet URL configured. Please set it in the Sync Completed Links page first.');
    }

    // Parse the sheet URL and get rows
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

    // Parse header row and find column indices by header names
    const headers = rows[0].map(h => h.trim());

    console.log('[SYNC] Headers found:', headers);

    // Find columns by name (more flexible matching)
    const clientNameIdx = headers.findIndex(h => h.toLowerCase().includes('client'));
    const web2Idx = headers.findIndex(h => h.toLowerCase().includes('web') && h.toLowerCase().includes('2'));
    const guestPostIdx = headers.findIndex(h => h.toLowerCase().includes('guest'));
    const pdfIdx = headers.findIndex(h => h.toLowerCase().includes('pdf'));
    const profileIdx = headers.findIndex(h => h.toLowerCase().includes('profile'));
    const citationIdx = headers.findIndex(h => h.toLowerCase().includes('citation') || h.toLowerCase().includes('directory'));
    const imageIdx = headers.findIndex(h => h.toLowerCase().includes('image'));

    // Validate we found the essential columns
    if (clientNameIdx === -1) {
      return await fail('Could not find "Client Name" column. Found columns: ' + headers.join(', '));
    }

    if (web2Idx === -1 || guestPostIdx === -1 || pdfIdx === -1 ||
        profileIdx === -1 || citationIdx === -1 || imageIdx === -1) {
      console.log('[SYNC] Missing columns:', { web2Idx, guestPostIdx, pdfIdx, profileIdx, citationIdx, imageIdx });
      return await fail('Missing required link type columns. Found: ' + headers.join(', '));
    }

    // Map of link types to column indices
    const linkTypeMap = {
      web2: web2Idx,
      guestpost: guestPostIdx,
      pdf: pdfIdx,
      profile: profileIdx,
      citation: citationIdx,
      image: imageIdx
    };

    // Process data rows (skip header)
    const today = new Date().toISOString().split('T')[0];
    let syncedCount = 0;
    const syncedClients = [];
    const errors = [];
    const databaseClients = await db.prepare(`
      SELECT id, name, assigned_associate_id FROM clients WHERE campaign_id = ? AND is_active = 1
    `).all(campaign.id);

    // Live, all-time total per associate straight from the sheet — summed across every
    // one of their clients (not just ones scheduled today), so an associate with
    // pre-existing sheet history sees their real total immediately rather than waiting
    // for the daily rotation to eventually reach every client.
    const lifetimeTotalByAssociate = {};

    // How much of this run's new progress went toward paying down an OLD overdue
    // row (task_date < today) rather than crediting today's own row — feeds the "By
    // Person" report's Pending Backlog box (see daily_pending_snapshot in db.js).
    const backlogResolvedByAssociate = {};

    console.log(`[SYNC] Found ${databaseClients.length} active clients in database`);

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const clientName = (row[clientNameIdx] || '').trim();

      if (!clientName) continue;

      // Find client in database - try exact match first, then partial
      let client = databaseClients.find(c => c.name === clientName);
      
      if (!client) {
        // Try case-insensitive partial match
        client = databaseClients.find(c => 
          c.name.toLowerCase().includes(clientName.toLowerCase()) ||
          clientName.toLowerCase().includes(c.name.toLowerCase())
        );
      }

      if (!client) {
        errors.push(`Client "${clientName}" not found in campaign`);
        console.log(`[SYNC] Client not found: "${clientName}"`);
        continue;
      }

      // Build result object for this client
      const clientResult = {
        name: clientName,
        web2: 0,
        guestpost: 0,
        pdf: 0,
        profile: 0,
        citation: 0,
        image: 0
      };

      // Update completed counts for each link type
      for (const [linkType, colIdx] of Object.entries(linkTypeMap)) {
        if (colIdx === -1 || colIdx >= row.length) continue;

        const sheetCompletedCount = parseInt(row[colIdx] || '0', 10);
        if (isNaN(sheetCompletedCount) || sheetCompletedCount < 0) {
          clientResult[linkType] = 0;
          continue;
        }

        clientResult[linkType] = sheetCompletedCount;

        // Every due row for this client/link type (today and any still-overdue
        // "Pending" ones). New progress from the sheet fills TODAY's own row
        // first — so an associate's real same-day work is credited to today
        // rather than silently vanishing into old debt — and only once today is
        // fully covered does the leftover pay down the oldest unfinished
        // "Pending" row(s), so a Pending task can still clear itself once there's
        // more than enough to cover both. No row is ever pushed past its own
        // target — if the sheet shows more than every due row's target combined,
        // the remainder is simply left unapplied for now rather than piled onto
        // today; it's picked up automatically on a later sync once a new
        // occurrence day opens up more room (alreadyRecorded stays capped, so
        // the gap against the sheet's total reappears as newProgress then).
        const dueTasks = await db.prepare(`
          SELECT id, task_date, target_count, completed_count
          FROM seo_tasks
          WHERE campaign_id = ? AND client_id = ? AND link_type = ? AND task_date <= ?
          ORDER BY task_date ASC
        `).all(campaign.id, client.id, linkType, today);

        if (dueTasks.length > 0) {
          const alreadyRecorded = dueTasks.reduce((sum, t) => sum + t.completed_count, 0);
          let newProgress = Math.max(0, sheetCompletedCount - alreadyRecorded);

          const todayIndex = dueTasks.findIndex(t => t.task_date === today);
          const orderedTasks = todayIndex === -1
            ? dueTasks
            : [dueTasks[todayIndex], ...dueTasks.slice(0, todayIndex), ...dueTasks.slice(todayIndex + 1)];

          const updates = [];
          let backlogApplied = 0;
          for (const task of orderedTasks) {
            if (newProgress <= 0) break;
            const room = Math.max(0, task.target_count - task.completed_count);
            if (room <= 0) continue;
            const applied = Math.min(room, newProgress);
            updates.push({ id: task.id, newCompleted: task.completed_count + applied });
            if (task.task_date < today) backlogApplied += applied;
            newProgress -= applied;
          }

          for (const { id, newCompleted } of updates) {
            await db.prepare('UPDATE seo_tasks SET completed_count = ? WHERE id = ?').run(newCompleted, id);
            syncedCount++;
          }

          if (backlogApplied > 0 && client.assigned_associate_id) {
            backlogResolvedByAssociate[client.assigned_associate_id] =
              (backlogResolvedByAssociate[client.assigned_associate_id] || 0) + backlogApplied;
          }

          if (updates.length > 0) {
            console.log(`[SYNC] Updated ${client.name} - ${linkType}: ${updates.length} row(s) (sheet: ${sheetCompletedCount}, already recorded: ${alreadyRecorded})`);
          }
        } else {
          console.log(`[SYNC] No due tasks found for ${client.name} - ${linkType} as of ${today}`);
        }
      }

      syncedClients.push(clientResult);

      if (client.assigned_associate_id) {
        const clientTotal = clientResult.web2 + clientResult.guestpost + clientResult.pdf
          + clientResult.profile + clientResult.citation + clientResult.image;
        lifetimeTotalByAssociate[client.assigned_associate_id] =
          (lifetimeTotalByAssociate[client.assigned_associate_id] || 0) + clientTotal;
      }
    }

    for (const [associateId, total] of Object.entries(lifetimeTotalByAssociate)) {
      await db.prepare('UPDATE users SET lifetime_completed_links = ? WHERE id = ?').run(total, associateId);
    }

    // Accumulate today's backlog resolution — this route runs 4x daily (plus any
    // manual trigger), and each run's newly-applied backlog progress should add on
    // top of the day's earlier runs, not overwrite them.
    for (const [associateId, resolved] of Object.entries(backlogResolvedByAssociate)) {
      await db.prepare(`
        INSERT INTO daily_pending_snapshot (user_id, work_date, resolved_count)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, work_date) DO UPDATE SET resolved_count = resolved_count + excluded.resolved_count
      `).run(associateId, today, resolved);
    }

    console.log(`[SYNC] Complete: ${syncedCount} records synced from ${syncedClients.length} clients`);

    const summary = `Synced ${syncedCount} completed link records from ${syncedClients.length} clients`;
    await logSyncRun('completed-links', 'success', summary, {
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
    console.error('[SYNC] Error:', err);
    await logSyncRun('completed-links', 'error', err.message);
    return Response.json({ error: `Sync error: ${err.message}` }, { status: 500 });
  }
}

export async function GET(request) {
  // Allow manual trigger of sync
  return POST(request);
}
