import { getDb } from '@/lib/db';
import { getActiveWebSeoCampaign } from '@/lib/services';
import { parseGoogleSheetUrl, fetchGoogleSheetRows } from '@/lib/googleSheets';
import { logSyncRun } from '@/lib/syncLog';
import { parseSheetLinks, loadStoredLinks, buildLinkWrites } from '@/lib/syncedClientLinks';

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
 * - Optional "Web2.0 Links" / "Guest Post Links": the URLs, stored in synced_web_client_links
 *   and attached to the task that sync marked as done (see src/lib/syncedClientLinks.js)
 *
 * Same approach as /api/sync-completed-links: the sheet holds a running
 * cumulative total per client, so new progress = sheet total minus everything
 * already recorded across this client/post-type's due rows — applied to
 * today's own row first, then any leftover pays down the oldest still-
 * incomplete ("Pending") row(s), so a Pending task can still clear once
 * there's more than enough to cover both.
 */

// Most recent due task of this client + post type that has work done — where links that
// arrive after their count was credited get attached.
function latestDoneTask(dueTasks, credited, postType) {
  const creditedDates = new Set(credited.filter((c) => c.link_type === postType).map((c) => c.task_date));
  const done = dueTasks.filter((t) => t.completed_count > 0 || creditedDates.has(t.task_date));
  if (done.length === 0) return null;
  const latest = done.reduce((a, b) => (b.task_date > a.task_date ? b : a));
  return { task_date: latest.task_date, link_type: postType };
}

const LINKS_INIT_KEY = 'synced_web_links_initialized';

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
    const campaign = await getActiveWebSeoCampaign();

    if (!campaign) {
      return await fail('No active Web SEO campaign');
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

    // The sheet also has a "... Links" column per post type holding URLs — those are not counts.
    const isLinksCol = (h) => h.toLowerCase().endsWith('links');
    const matchers = {
      web2: (h) => h.includes('web') && h.includes('2'),
      guestpost: (h) => h.includes('guest'),
    };
    const clientNameIdx = headers.findIndex(h => h.toLowerCase().includes('client'));
    const web2Idx = headers.findIndex(h => !isLinksCol(h) && matchers.web2(h.toLowerCase()));
    const guestPostIdx = headers.findIndex(h => !isLinksCol(h) && matchers.guestpost(h.toLowerCase()));
    const linkUrlCols = Object.fromEntries(
      Object.entries(matchers)
        .map(([type, match]) => [type, headers.findIndex(h => isLinksCol(h) && h.toLowerCase() !== 'links' && match(h.toLowerCase()))])
        .filter(([, idx]) => idx !== -1)
    );

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
      SELECT id, name, business_name, assigned_associate_id FROM web_clients WHERE webseo_campaign_id = ? AND is_active = 1
    `).all(campaign.id);

    console.log(`[WEBSEO SYNC] Found ${dbClients.length} web clients in database`);

    // Live, all-time total per associate straight from the sheet — summed across every
    // one of their clients (not just ones scheduled today), so an associate with
    // pre-existing sheet history sees their real total immediately rather than waiting
    // for the daily rotation to eventually reach every client.
    const lifetimeTotalByAssociate = {};

    // Links columns: a failure here must never fail the sync itself. The very first sync
    // that sees these columns stores whatever is already there as history (seeded); after
    // that, new URLs are attached to the task that sync credited.
    const linkWrites = [];
    let storedLinks = null;
    let firstLinksRun = false;
    if (Object.keys(linkUrlCols).length > 0) {
      try {
        const init = await db.prepare('SELECT value FROM settings WHERE key = ?').get(LINKS_INIT_KEY);
        firstLinksRun = !init;
        storedLinks = await loadStoredLinks(db, 'synced_web_client_links', firstLinksRun);
      } catch (e) {
        console.error('[WEBSEO SYNC] Could not load stored links:', e);
      }
    }

    // How much of this run's new progress went toward paying down an OLD overdue
    // row (task_date < today) rather than crediting today's own row — feeds the "By
    // Person" report's Pending Backlog box (see daily_pending_snapshot in db.js).
    const backlogResolvedByAssociate = {};

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
      const credited = [];
      const dueByType = {};

      for (const [postType, colIdx] of Object.entries(postTypeMap)) {
        if (colIdx === -1 || colIdx >= row.length) continue;

        const sheetCompletedCount = parseInt(row[colIdx] || '0', 10);
        if (isNaN(sheetCompletedCount) || sheetCompletedCount < 0) {
          continue;
        }

        clientResult[postType] = sheetCompletedCount;

        // Every due row for this client/post type (today and any still-overdue
        // "Pending" ones). New progress fills TODAY's own row first — so an
        // associate's real same-day work is credited to today rather than
        // silently vanishing into old debt — and only once today is fully
        // covered does the leftover pay down the oldest unfinished "Pending"
        // row(s) (see sync-completed-links for the full rationale). No row is
        // ever pushed past its own target — a remainder beyond every due row's
        // target simply stays unapplied until a new occurrence day opens up
        // more room on a later sync.
        const dueTasks = await db.prepare(`
          SELECT id, task_date, target_count, completed_count
          FROM webseo_tasks
          WHERE webseo_campaign_id = ? AND client_id = ? AND post_type = ? AND task_date <= ?
          ORDER BY task_date ASC
        `).all(campaign.id, client.id, postType, today);

        dueByType[postType] = dueTasks;
        if (dueTasks.length === 0) continue;

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
          credited.push({ task_date: task.task_date, link_type: postType, applied });
          if (task.task_date < today) backlogApplied += applied;
          newProgress -= applied;
        }

        for (const { id, newCompleted } of updates) {
          await db.prepare('UPDATE webseo_tasks SET completed_count = ? WHERE id = ?').run(newCompleted, id);
          syncedCount++;
        }

        if (backlogApplied > 0 && client.assigned_associate_id) {
          backlogResolvedByAssociate[client.assigned_associate_id] =
            (backlogResolvedByAssociate[client.assigned_associate_id] || 0) + backlogApplied;
        }

        if (updates.length > 0) {
          console.log(`[WEBSEO SYNC] Updated ${client.business_name} - ${postType}: ${updates.length} row(s) (sheet: ${sheetCompletedCount}, already recorded: ${alreadyRecorded})`);
        }
      }

      if (storedLinks) {
        for (const [postType, idx] of Object.entries(linkUrlCols)) {
          if (idx >= row.length) continue;
          try {
            linkWrites.push(...buildLinkWrites({
              stored: storedLinks,
              clientId: client.id,
              linkType: postType,
              urls: parseSheetLinks(row[idx]),
              credited: credited.filter((c) => c.link_type === postType),
              fallback: latestDoneTask(dueByType[postType] || [], credited, postType),
            }));
          } catch (e) {
            console.error(`[WEBSEO SYNC] ${postType} links for ${clientName} failed:`, e);
          }
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

    // Accumulate today's backlog resolution — this route runs once daily (plus any
    // manual trigger), and each run's newly-applied backlog progress should add on
    // top of the day's earlier runs, not overwrite them.
    for (const [associateId, resolved] of Object.entries(backlogResolvedByAssociate)) {
      await db.prepare(`
        INSERT INTO daily_pending_snapshot (user_id, work_date, resolved_count)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, work_date) DO UPDATE SET resolved_count = resolved_count + excluded.resolved_count
      `).run(associateId, today, resolved);
    }

    if (storedLinks) {
      try {
        for (let i = 0; i < linkWrites.length; i += 200) {
          await db.batch(linkWrites.slice(i, i + 200));
        }
        if (firstLinksRun) {
          await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, '1')").run(LINKS_INIT_KEY);
        }
      } catch (e) {
        console.error('[WEBSEO SYNC] Saving links failed:', e);
      }
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
