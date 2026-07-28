import { getDb } from './db';
import { getValidAccessToken } from './webClientsImport';
import { getOffDaysSet, getWorkingDays } from './offDays';

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
 * Matches a sheet client name against the clients table — exact match first, then
 * the same case-insensitive bidirectional-substring fuzzy match used by
 * sync-completed-links, since sheet names occasionally drift slightly from the DB
 * (casing, a "(wix)" suffix, etc.).
 */
function matchClient(name, dbClients) {
  let client = dbClients.find(c => c.name === name);
  if (!client) {
    client = dbClients.find(c =>
      c.name.toLowerCase().includes(name.toLowerCase()) ||
      name.toLowerCase().includes(c.name.toLowerCase())
    );
  }
  return client;
}

/**
 * Incrementally updates writer_offpage_assignments for one task_type: drops
 * assignments for clients no longer present, and assigns any newly-seen client to
 * whichever active writer currently has the fewest clients for this task_type —
 * load-balanced, not a full reshuffle, so existing pairings are stable across syncs.
 */
async function syncAssignments(db, campaignId, taskType, matchedClientIds) {
  const existing = await db.prepare(`
    SELECT id, client_id, writer_id FROM writer_offpage_assignments
    WHERE campaign_id = ? AND task_type = ?
  `).all(campaignId, taskType);

  const matchedSet = new Set(matchedClientIds);
  const existingByClient = new Map(existing.map(a => [a.client_id, a]));

  for (const a of existing) {
    if (!matchedSet.has(a.client_id)) {
      await db.prepare('DELETE FROM writer_offpage_assignments WHERE id = ?').run(a.id);
      existingByClient.delete(a.client_id);
    }
  }

  const writers = await db.prepare(`
    SELECT id FROM users WHERE role = 'writer' AND is_active = 1 ORDER BY id
  `).all();
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
      INSERT INTO writer_offpage_assignments (campaign_id, task_type, client_id, writer_id)
      VALUES (?, ?, ?, ?)
    `).run(campaignId, taskType, clientId, leastLoadedWriter);
    loadByWriter.set(leastLoadedWriter, minLoad + 1);
  }
}

/**
 * Rebuilds writer_offpage_tasks for one task_type — safe to wipe and regenerate
 * every run since completed_count is always re-derived live from the sheet's
 * current Status values passed in via `blocksByClientId`, not carried over from
 * prior rows.
 *
 * Weekly rotation: the campaign's working days are grouped into 5-day weeks. A
 * writer's clients are split into 5 rotation groups — group g is visited on the
 * same day-of-week every week (day g+1, g+1+5, g+1+10, ...), so by the end of any
 * single week every client has gotten some progress, not just whichever subset
 * happened to be scheduled that week. Each client's 15 tasks (5 GBP categories × 3,
 * or 10+5 Web-Off categories × 2, interleaved so a visit mixes categories rather
 * than being all-one-type) are split into one equal chunk per weekly visit (5 tasks/
 * visit across 3 weekly visits) — so a writer with ~7 clients/day × 5 tasks/visit
 * lands around 35 tasks/day for GBP, proportionally fewer for Web-Off.
 */
async function generateTasksForType(db, campaign, taskType, blocksByClientId) {
  await db.prepare('DELETE FROM writer_offpage_tasks WHERE campaign_id = ? AND task_type = ?').run(campaign.id, taskType);

  const offDays = await getOffDaysSet(campaign.id);
  const totalDays = campaign.total_days || 16;
  const workingDays = getWorkingDays(campaign.start_date, totalDays, offDays);

  const daysPerWeek = 5;
  const numWeeks = Math.floor(workingDays.length / daysPerWeek);
  if (numWeeks === 0) return 0; // not enough working days for even one full week

  const assignments = await db.prepare(`
    SELECT client_id, writer_id FROM writer_offpage_assignments
    WHERE campaign_id = ? AND task_type = ?
    ORDER BY client_id
  `).all(campaign.id, taskType);

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

        // Interleave this client's category blocks round-robin (Guest Post, Web
        // 2.0, PDF, Guest Post, Web 2.0, PDF, ...) rather than concatenating them,
        // so a single visit's chunk mixes categories instead of being all one type.
        const catEntries = [...categories.entries()];
        const maxLen = Math.max(...catEntries.map(([, stats]) => stats.total));
        const units = [];
        for (let i = 0; i < maxLen; i++) {
          for (const [category, stats] of catEntries) {
            if (i < stats.total) units.push({ category, done: i < stats.done });
          }
        }
        if (units.length === 0) continue;

        // Split this client's units into one equal chunk per weekly visit.
        const chunkBase = Math.floor(units.length / numWeeks);
        const chunkRemainder = units.length % numWeeks;
        let unitIdx = 0;

        for (let w = 0; w < numWeeks; w++) {
          const chunkSize = chunkBase + (w < chunkRemainder ? 1 : 0);
          const dayIndex = w * daysPerWeek + g;
          const { dayNumber, dateStr } = workingDays[dayIndex];

          for (let k = 0; k < chunkSize; k++) {
            const unit = units[unitIdx++];
            rows.push({
              campaign_id: campaign.id,
              writer_id: writerId,
              client_id: clientId,
              task_type: taskType,
              category: unit.category,
              day_number: dayNumber,
              task_date: dateStr,
              target_count: 1,
              completed_count: unit.done ? 1 : 0,
            });
          }
        }
      }
    });
  }

  if (rows.length > 0) {
    const insertSql = `
      INSERT INTO writer_offpage_tasks
        (campaign_id, writer_id, client_id, task_type, category, day_number, task_date, target_count, completed_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await db.batch(rows.map(r => ({
      sql: insertSql,
      args: [r.campaign_id, r.writer_id, r.client_id, r.task_type, r.category, r.day_number, r.task_date, r.target_count, r.completed_count],
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
export async function runWriterOffpageSync(campaignId) {
  const db = await getDb();
  const campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const settings = await db.prepare("SELECT value FROM settings WHERE key = ?").get('writer_offpage_sheet_url');
  const sheetUrl = settings?.value;
  if (!sheetUrl) throw new Error('No Google Sheet URL configured for writer GBP/Web-Off tasks');

  const sheetIdMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!sheetIdMatch) throw new Error("Invalid Google Sheet URL. Make sure it's a full spreadsheet URL.");
  const sheetId = sheetIdMatch[1];

  const tokenResult = await getValidAccessToken();
  if (tokenResult.error) throw new Error(tokenResult.error);
  const accessToken = tokenResult.accessToken;

  const dbClients = await db.prepare(`
    SELECT id, name FROM clients WHERE campaign_id = ? AND is_active = 1
  `).all(campaignId);

  const results = {};

  for (const { taskType, suffix } of TAB_CONFIGS) {
    const tabName = currentTabName(suffix);
    try {
      const blocks = await fetchTabBlocks(sheetId, accessToken, tabName);

      const blocksByClientId = new Map();
      const errors = [];
      for (const [clientName, categories] of blocks) {
        const match = matchClient(clientName, dbClients);
        if (!match) {
          errors.push(`Client "${clientName}" not found in campaign`);
          continue;
        }
        blocksByClientId.set(match.id, categories);
      }

      await syncAssignments(db, campaignId, taskType, [...blocksByClientId.keys()]);

      const taskCount = await generateTasksForType(db, campaign, taskType, blocksByClientId);

      results[taskType] = {
        success: true,
        tabName,
        clientCount: blocksByClientId.size,
        taskCount,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (err) {
      results[taskType] = { success: false, tabName, error: err.message };
    }
  }

  return results;
}
