// URLs from the Completed Links sheet's per-type link columns ("Web2.0 Links",
// "Guest Post Links", ...: one cell per client, many URLs separated by
// commas/spaces/newlines), stored in synced_client_links with their link_type.
//
//  - First sync ever (table empty): every URL is stored as seeded = 1 — it is
//    history, not tied to any task.
//  - Later syncs: a URL not stored yet for that client is new. It is attached
//    (task_date + link_type) to the task row(s) that same sync marked as done,
//    one link per credited unit of the SAME link type, in order. When nothing was credited the link is
//    stored unattached and picked up by the next sync that credits that client.

export function parseSheetLinks(cell) {
  const found = String(cell || '').match(/https?:\/\/[^\s,;"'<>]+/gi) || [];
  const seen = new Set();
  const urls = [];
  for (const raw of found) {
    const url = raw.replace(/[).\]]+$/, '');
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

// Loads what is already stored: { isFirstRun, known: Map<clientId, Set<url>>,
// unattached: Map<clientId, url[]> }.
export async function loadStoredLinks(db) {
  const rows = await db.prepare('SELECT client_id, url, seeded, task_date, link_type FROM synced_client_links').all();
  const known = new Map();
  const unattached = new Map();
  for (const r of rows) {
    if (!known.has(r.client_id)) known.set(r.client_id, new Set());
    known.get(r.client_id).add(r.url);
    if (!r.seeded && !r.task_date) {
      const key = `${r.client_id}|${r.link_type || ''}`;
      if (!unattached.has(key)) unattached.set(key, []);
      unattached.get(key).push(r.url);
    }
  }
  return { isFirstRun: rows.length === 0, known, unattached };
}

/**
 * Builds the write statements for one client. `credited` is this sync's
 * [{ task_date, link_type, applied }] for the client, in the order credited.
 */
export function buildLinkWrites({ stored, clientId, linkType, urls, credited, fallback = null }) {
  const writes = [];
  const known = stored.known.get(clientId) || new Set();
  const fresh = urls.filter((u) => !known.has(u));

  if (stored.isFirstRun) {
    for (const url of fresh) {
      writes.push({
        sql: 'INSERT OR IGNORE INTO synced_client_links (client_id, url, seeded, link_type) VALUES (?, ?, 1, ?)',
        args: [clientId, url, linkType || null],
      });
    }
    return writes;
  }

  // New links plus any earlier ones still waiting for a task to be credited.
  const waiting = (stored.unattached.get(`${clientId}|${linkType || ''}`) || []).filter((u) => urls.includes(u));
  const queue = [...waiting, ...fresh];
  // Nothing credited this sync (the links showed up in the sheet after their count was
  // already credited): attach to the client's most recent done task of this type.
  const slots = credited.length > 0 ? credited : (fallback ? [{ ...fallback, applied: queue.length }] : []);
  let cursor = 0;
  for (const slot of slots) {
    for (let n = 0; n < slot.applied && cursor < queue.length; n++, cursor++) {
      writes.push(attach(clientId, queue[cursor], slot, known));
    }
  }
  // More links than credited units: the rest ride along with the last credited task.
  if (slots.length > 0) {
    const last = slots[slots.length - 1];
    for (; cursor < queue.length; cursor++) writes.push(attach(clientId, queue[cursor], last, known));
  } else {
    for (const url of fresh) {
      writes.push({
        sql: 'INSERT OR IGNORE INTO synced_client_links (client_id, url, seeded, link_type) VALUES (?, ?, 0, ?)',
        args: [clientId, url, linkType || null],
      });
    }
  }
  return writes;
}

function attach(clientId, url, slot, known) {
  if (known.has(url)) {
    return {
      sql: 'UPDATE synced_client_links SET task_date = ?, link_type = ? WHERE client_id = ? AND url = ?',
      args: [slot.task_date, slot.link_type, clientId, url],
    };
  }
  return {
    sql: 'INSERT OR IGNORE INTO synced_client_links (client_id, url, seeded, task_date, link_type) VALUES (?, ?, 0, ?, ?)',
    args: [clientId, url, slot.task_date, slot.link_type],
  };
}

// Sets task.links (URL strings) on each seo_tasks row from the links the sync
// attached to that client + day + link type. Returns the same array.
export async function attachSyncedLinks(db, tasks) {
  const rows = tasks.filter((t) => t.completed_count > 0);
  if (rows.length === 0) {
    tasks.forEach((t) => { t.links = []; });
    return tasks;
  }
  const clientIds = [...new Set(rows.map((t) => t.client_id))];
  const dates = [...new Set(rows.map((t) => t.task_date))];
  const found = await db.prepare(`
    SELECT client_id, url, task_date, link_type FROM synced_client_links
    WHERE client_id IN (${clientIds.map(() => '?').join(',')})
      AND task_date IN (${dates.map(() => '?').join(',')})
    ORDER BY id
  `).all(...clientIds, ...dates);
  const byKey = new Map();
  for (const l of found) {
    const key = `${l.client_id}|${l.task_date}|${l.link_type}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(l.url);
  }
  for (const t of tasks) t.links = byKey.get(`${t.client_id}|${t.task_date}|${t.link_type}`) || [];
  return tasks;
}
