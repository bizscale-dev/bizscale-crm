import { getDb } from './db';
import { getValidAccessToken } from './webClientsImport';
import { getWorkingDays } from './offDays';
import { getOffDaysSet as getWriterCampaignOffDaysSet } from './writerCampaignOffDays';

const TAB_CONFIGS = [
  { taskType: 'gbp', suffix: 'GBP-Off Page' },
  { taskType: 'weboff', suffix: 'Web-Off Page' },
];

function currentTabName(suffix) {
  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'long' });
  const year = now.getFullYear();
  return `${month} ${year} ${suffix}`;
}

/**
 * Reads one GBP-Off Page / Web-Off Page tab and groups its rows into per-client,
 * per-category blocks. Each tab lists 15 rows per client (one per specific
 * keyword/content piece); the client name is only filled on that client's first row
 * (fill-down), and a Status column (strict "None"/"Done" dropdown in the sheet) is
 * the sole completion signal — there is no delta/date math here, just a live count.
 */
async function fetchTabBlocks(sheetId, accessToken, tabName) {
  const range = `'${tabName}'!A:J`;
  const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;

  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Tab "${tabName}" not found — has it been created yet?`);
    }
    if (response.status === 403) {
      throw new Error('Access denied. Make sure the sheet is shared with the Google account you authorized.');
    }
    throw new Error(`Failed to fetch tab "${tabName}": ${response.status}`);
  }

  const data = await response.json();
  const rows = data.values || [];
  if (rows.length < 2) {
    throw new Error(`Tab "${tabName}" has no data rows`);
  }

  const headers = rows[0].map(h => (h || '').trim());
  const clientIdx = headers.findIndex(h => h.toLowerCase().includes('client'));
  const categoryIdx = headers.findIndex(h => h.toLowerCase().includes('category'));
  const statusIdx = headers.findIndex(h => h.toLowerCase().includes('status'));

  if (clientIdx === -1 || categoryIdx === -1 || statusIdx === -1) {
    throw new Error(`Tab "${tabName}" is missing a required column (Client Name/Category/Status). Found: ${headers.join(', ')}`);
  }

  // { clientName: { category: { total, done } } }, in first-seen order.
  const blocks = new Map();
  let currentClient = null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = (row[clientIdx] || '').trim();
    if (name) currentClient = name;
    if (!currentClient) continue;

    const category = (row[categoryIdx] || '').trim();
    if (!category) continue;

    if (!blocks.has(currentClient)) blocks.set(currentClient, new Map());
    const clientBlock = blocks.get(currentClient);
    if (!clientBlock.has(category)) clientBlock.set(category, { total: 0, done: 0 });

    const catStats = clientBlock.get(category);
    catStats.total++;
    if ((row[statusIdx] || '').trim() === 'Done') catStats.done++;
  }

  return blocks;
}

/**
 * Matches a sheet client name against an already-loaded list — exact match first,
 * then the same case-insensitive bidirectional-substring fuzzy match used by
 * sync-completed-links, since sheet names occasionally drift slightly (casing, a
 * "(wix)" suffix, etc.) between one sync and the next.
 */
function matchClient(name, candidates) {
  let client = candidates.find(c => c.name === name);
  if (!client) {
    client = candidates.find(c =>
      c.name.toLowerCase().includes(name.toLowerCase()) ||
      name.toLowerCase().includes(c.name.toLowerCase())
    );
  }
  return client;
}

/**
 * Resolves a sheet client name to a writer_clients row for this writer campaign —
 * fuzzy-matching against clients already seen this campaign, creating a new row
 * only when nothing matches. Writers have their own independent client roster
 * (populated straight from the GBP-Off/Web-Off sheets, no separate import step),
 * not the SEO campaign's `clients` table — see writer_clients in src/lib/db.js.
 */
async function resolveWriterClient(db, writerCampaignId, name, cache) {
  const existing = matchClient(name, [...cache.values()]);
  if (existing) return existing;

  const inserted = await db.prepare(
    'INSERT INTO writer_clients (writer_campaign_id, name) VALUES (?, ?)'
  ).run(writerCampaignId, name);
  const client = { id: inserted.lastInsertRowid, name };
  cache.set(client.id, client);
  return client;
}

/**
 * Incrementally updates writer_offpage_assignments for one task_type: drops
 * assignments for clients no longer present *or* whose writer is no longer an
 * active writer (deleted or deactivated), and assigns any now-unassigned client to
 * whichever active writer currently has the fewest clients for this task_type —
 * load-balanced, not a full reshuffle, so existing pairings are stable across syncs.
 */
async function syncAssignments(db, writerCampaignId, sourceCampaignId, taskType, matchedClientIds) {
  const existing = await db.prepare(`
    SELECT id, client_id, writer_id FROM writer_offpage_assignments
    WHERE writer_campaign_id = ? AND task_type = ?
  `).all(writerCampaignId, taskType);

  const writers = await db.prepare(`
    SELECT id FROM users WHERE role = 'writer' AND is_active = 1 ORDER BY id
  `).all();
  const activeWriterIds = new Set(writers.map(w => w.id));

  const matchedSet = new Set(matchedClientIds);
  const existingByClient = new Map(existing.map(a => [a.client_id, a]));

  for (const a of existing) {
    if (!matchedSet.has(a.client_id) || !activeWriterIds.has(a.writer_id)) {
      await db.prepare('DELETE FROM writer_offpage_assignments WHERE id = ?').run(a.id);
      existingByClient.delete(a.client_id);
    }
  }

  if (writers.length === 0) return;

  const loadByWriter = new Map(writers.map(w => [w.id, 0]));
  for (const a of existingByClient.values()) {
    if (loadByWriter.has(a.writer_id)) loadByWriter.set(a.writer_id, loadByWriter.get(a.writer_id) + 1);
  }

  for (const clientId of matchedClientIds) {
    if (existingByClient.has(clientId)) continue;

    let leastLoadedWriter = writers[0].id;
    let minLoad = Infinity;
    for (const [writerId, load] of loadByWriter) {
      if (load < minLoad) { minLoad = load; leastLoadedWriter = writerId; }
    }

    await db.prepare(`
      INSERT INTO writer_offpage_assignments (campaign_id, writer_campaign_id, task_type, client_id, writer_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(sourceCampaignId, writerCampaignId, taskType, clientId, leastLoadedWriter);
    loadByWriter.set(leastLoadedWriter, minLoad + 1);
  }
}

/**
 * Rebuilds writer_offpage_tasks for one task_type. The day/category schedule
 * (target_count) is structural and safe to fully recompute every run. completed_count
 * is NOT — a day that has already passed is frozen forever once set, and only
 * *today's* row is recomputed from the sheet's current Status values. Earlier this
 * whole table (including past days) was wiped and re-derived live from the sheet on
 * every sync, using a "first N sheet rows in Done order count as done" heuristic —
 * that meant an already-passed day's number could silently change on a later sync
 * purely because unrelated, more recent work pushed the sheet's overall Done count
 * up, which the heuristic then credited to the earliest chunk first. That's not a
 * real per-day record, so it's replaced here with an explicit daily delta: each
 * day's completed_count is either preserved from before (past), computed as
 * (current sheet Done count for that client/category) minus (everything already
 * frozen on earlier days) (today), or left at 0 (future, hasn't happened yet).
 *
 * Weekly rotation: the campaign's working days are grouped into 5-day weeks. A
 * writer's clients are split into 5 rotation groups — group g is visited on the
 * same day-of-week every week (day g+1, g+1+5, g+1+10, ...), so every client gets
 * touched every week, not just whichever subset happened to be scheduled that
 * week. Each category's row count is split independently across the numWeeks
 * weekly visits (front-loaded remainder, e.g. GBP's 5 Guest Post rows become
 * 2/2/1 across 3 weeks) — so a client's weekly visit has one row per category
 * with a predictable target (e.g. GBP: 2 Guest Post + 2 Web 2.0 + 2 PDF done by
 * the end of week 1), instead of one row per individual unit with a mixed,
 * unpredictable per-category count.
 */
async function generateTasksForType(db, writerCampaign, taskType, blocksByClientId) {
  const todayStr = new Date().toISOString().split('T')[0];

  // Snapshot yesterday-and-earlier before wiping the table, so today's/future's
  // rows can be rebuilt structurally while past days' real completed_count survives.
  const frozenRows = await db.prepare(`
    SELECT client_id, category, day_number, completed_count
    FROM writer_offpage_tasks
    WHERE writer_campaign_id = ? AND task_type = ? AND task_date < ?
  `).all(writerCampaign.id, taskType, todayStr);
  const frozenByDay = new Map(frozenRows.map(r => [`${r.client_id}|${r.category}|${r.day_number}`, r.completed_count]));

  const pastDoneRows = await db.prepare(`
    SELECT client_id, category, SUM(completed_count) as doneSum
    FROM writer_offpage_tasks
    WHERE writer_campaign_id = ? AND task_type = ? AND task_date < ?
    GROUP BY client_id, category
  `).all(writerCampaign.id, taskType, todayStr);
  const pastDoneByClientCategory = new Map(pastDoneRows.map(r => [`${r.client_id}|${r.category}`, r.doneSum || 0]));

  await db.prepare('DELETE FROM writer_offpage_tasks WHERE writer_campaign_id = ? AND task_type = ?').run(writerCampaign.id, taskType);

  const offDays = await getWriterCampaignOffDaysSet(writerCampaign.id);
  const totalDays = writerCampaign.total_days || 16;
  const workingDays = getWorkingDays(writerCampaign.start_date, totalDays, offDays);

  const daysPerWeek = 5;
  const numWeeks = Math.floor(workingDays.length / daysPerWeek);
  if (numWeeks === 0) return 0; // not enough working days for even one full week

  const assignments = await db.prepare(`
    SELECT client_id, writer_id FROM writer_offpage_assignments
    WHERE writer_campaign_id = ? AND task_type = ?
    ORDER BY client_id
  `).all(writerCampaign.id, taskType);

  const clientsByWriter = new Map();
  for (const a of assignments) {
    if (!blocksByClientId.has(a.client_id)) continue; // client no longer on the sheet
    if (!clientsByWriter.has(a.writer_id)) clientsByWriter.set(a.writer_id, []);
    clientsByWriter.get(a.writer_id).push(a.client_id);
  }

  const rows = [];

  for (const [writerId, writerClients] of clientsByWriter) {
    const n = writerClients.length;
    if (n === 0) continue;

    // Split this writer's clients into daysPerWeek rotation groups as evenly as
    // possible (e.g. 36 clients -> 8/7/7/7/7).
    const groupBase = Math.floor(n / daysPerWeek);
    const groupRemainder = n % daysPerWeek;
    const groups = [];
    let ci = 0;
    for (let g = 0; g < daysPerWeek; g++) {
      const size = groupBase + (g < groupRemainder ? 1 : 0);
      groups.push(writerClients.slice(ci, ci + size));
      ci += size;
    }

    groups.forEach((groupClients, g) => {
      for (const clientId of groupClients) {
        const categories = blocksByClientId.get(clientId);
        const catEntries = [...categories.entries()];

        // Split each category's row count independently across the numWeeks
        // weekly visits (front-loaded remainder — same convention as the
        // day-of-week grouping above), so every week has an explicit,
        // predictable per-category target rather than an interleaved mixed
        // count. This target/size math is purely structural (how many rows
        // exist in the sheet for this category) — it doesn't depend on Done
        // status, so it's safe to recompute every sync regardless of date.
        const catWeeklySizes = catEntries.map(([category, stats]) => {
          const chunkBase = Math.floor(stats.total / numWeeks);
          const chunkRemainder = stats.total % numWeeks;
          const sizes = [];
          for (let w = 0; w < numWeeks; w++) {
            sizes.push(chunkBase + (w < chunkRemainder ? 1 : 0));
          }
          return { category, sizes, currentDone: stats.done };
        });

        for (let w = 0; w < numWeeks; w++) {
          const dayIndex = w * daysPerWeek + g;
          const { dayNumber, dateStr } = workingDays[dayIndex];

          for (const { category, sizes, currentDone } of catWeeklySizes) {
            const size = sizes[w];
            if (size === 0) continue;

            let completed;
            if (dateStr < todayStr) {
              // Already passed — frozen. If this exact day never existed
              // before (brand new schedule / newly added client), there's no
              // history to preserve, so it starts at 0.
              completed = frozenByDay.get(`${clientId}|${category}|${dayNumber}`) ?? 0;
            } else if (dateStr === todayStr) {
              // Today — the only day that's still live. completed = whatever
              // the sheet currently shows as Done for this client/category,
              // minus whatever's already been credited to earlier frozen days.
              const pastDone = pastDoneByClientCategory.get(`${clientId}|${category}`) || 0;
              completed = Math.min(size, Math.max(0, currentDone - pastDone));
            } else {
              // Future — hasn't happened yet.
              completed = 0;
            }

            rows.push({
              campaign_id: writerCampaign.source_campaign_id,
              writer_campaign_id: writerCampaign.id,
              writer_id: writerId,
              client_id: clientId,
              task_type: taskType,
              category,
              day_number: dayNumber,
              task_date: dateStr,
              target_count: size,
              completed_count: completed,
            });
          }
        }
      }
    });
  }

  if (rows.length > 0) {
    const insertSql = `
      INSERT INTO writer_offpage_tasks
        (campaign_id, writer_campaign_id, writer_id, client_id, task_type, category, day_number, task_date, target_count, completed_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await db.batch(rows.map(r => ({
      sql: insertSql,
      args: [r.campaign_id, r.writer_campaign_id, r.writer_id, r.client_id, r.task_type, r.category, r.day_number, r.task_date, r.target_count, r.completed_count],
    })));
  }

  return rows.length;
}

/**
 * Reads the GBP-Off Page and Web-Off Page tabs (dynamically named by current
 * month/year) and rebuilds writer_offpage_assignments/writer_offpage_tasks from
 * them. Each tab is independent — a failure on one (e.g. next month's tab not
 * created yet) doesn't block the other.
 */
export async function runWriterOffpageSync(writerCampaignId) {
  const db = await getDb();
  const writerCampaign = await db.prepare('SELECT * FROM writer_campaigns WHERE id = ?').get(writerCampaignId);
  if (!writerCampaign) throw new Error('Writer campaign not found');

  const settings = await db.prepare("SELECT value FROM settings WHERE key = ?").get('writer_offpage_sheet_url');
  const sheetUrl = settings?.value;
  if (!sheetUrl) throw new Error('No Google Sheet URL configured for writer GBP/Web-Off tasks');

  const sheetIdMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!sheetIdMatch) throw new Error("Invalid Google Sheet URL. Make sure it's a full spreadsheet URL.");
  const sheetId = sheetIdMatch[1];

  const tokenResult = await getValidAccessToken();
  if (tokenResult.error) throw new Error(tokenResult.error);
  const accessToken = tokenResult.accessToken;

  // This writer campaign's own client roster so far, keyed by id — seeded from
  // writer_clients and grown in-place as new names are seen on the sheet below.
  const existingWriterClients = await db.prepare(
    'SELECT id, name FROM writer_clients WHERE writer_campaign_id = ?'
  ).all(writerCampaignId);
  const writerClientCache = new Map(existingWriterClients.map(c => [c.id, c]));

  const results = {};

  for (const { taskType, suffix } of TAB_CONFIGS) {
    const tabName = currentTabName(suffix);
    try {
      const blocks = await fetchTabBlocks(sheetId, accessToken, tabName);

      const blocksByClientId = new Map();
      for (const [clientName, categories] of blocks) {
        const client = await resolveWriterClient(db, writerCampaignId, clientName, writerClientCache);
        blocksByClientId.set(client.id, categories);
      }

      await syncAssignments(db, writerCampaignId, writerCampaign.source_campaign_id, taskType, [...blocksByClientId.keys()]);

      const taskCount = await generateTasksForType(db, writerCampaign, taskType, blocksByClientId);

      results[taskType] = {
        success: true,
        tabName,
        clientCount: blocksByClientId.size,
        taskCount,
      };
    } catch (err) {
      results[taskType] = { success: false, tabName, error: err.message };
    }
  }

  return results;
}
