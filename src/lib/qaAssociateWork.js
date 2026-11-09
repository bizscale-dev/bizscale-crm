import { attachSyncedLinks, attachSyncedWebLinks } from './syncedClientLinks';

// Pakistan calendar date (the team's working day), optionally shifted by whole days.
export function pakistanDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const d = new Date(`${parts}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

/**
 * Per-associate QA issue counts from the reports QA filed against their links
 * (qa_reports.associate_id): { [userId]: { total, resolved, pending } }. Kept per associate, never summed.
 */
export async function loadAssociateIssueStats(db, associateIds) {
  const stats = {};
  for (const id of associateIds) stats[id] = { total: 0, resolved: 0, pending: 0 };
  if (associateIds.length === 0) return stats;
  const rows = await db.prepare(`
    SELECT associate_id, status, COUNT(*) AS n FROM qa_reports
    WHERE associate_id IN (${associateIds.map(() => '?').join(',')})
    GROUP BY associate_id, status
  `).all(...associateIds);
  for (const r of rows) {
    const st = stats[r.associate_id];
    if (!st) continue;
    st.total += r.n;
    if (r.status === 'resolved') st.resolved += r.n; else st.pending += r.n;
  }
  return stats;
}

/**
 * What every associate of one kind ('seo' | 'web') completed on `date`:
 * [{ id, name, total, stats: { total, resolved, pending issues }, clients: [{ clientId, name, types: [{ type, count, links: [{ url, status: 'pass'|'fail'|'' }] }] }] }].
 * Associates with nothing done that day are still listed (total 0) so QA sees who delivered nothing.
 */
export async function loadAssociateWork(db, kind, date) {
  const isWeb = kind === 'web';
  const users = await db.prepare(
    isWeb
      ? "SELECT id, name FROM users WHERE role = 'web_seo_associate' AND is_active = 1 ORDER BY name"
      : "SELECT id, name FROM users WHERE role IN ('seo_associate','senior_seo_associate') AND is_active = 1 ORDER BY name"
  ).all();

  const rows = isWeb
    ? await db.prepare(`
        SELECT t.associate_id, t.client_id, t.task_date, t.post_type, t.post_type AS link_type, t.completed_count, c.name AS client_name
        FROM webseo_tasks t JOIN web_clients c ON c.id = t.client_id
        WHERE t.task_date = ? AND t.completed_count > 0
        ORDER BY c.name, t.post_type
      `).all(date)
    : await db.prepare(`
        SELECT t.associate_id, t.client_id, t.task_date, t.link_type, t.completed_count, c.name AS client_name
        FROM seo_tasks t JOIN clients c ON c.id = t.client_id
        WHERE t.task_date = ? AND t.completed_count > 0
        ORDER BY c.name, t.link_type
      `).all(date);
  await (isWeb ? attachSyncedWebLinks : attachSyncedLinks)(db, rows);

  // QA's Pass / Fail mark per link.
  const clientIds = [...new Set(rows.map((r) => r.client_id))];
  const checks = new Map();
  if (clientIds.length > 0) {
    const found = await db.prepare(`
      SELECT client_id, url, status FROM qa_link_checks
      WHERE kind = ? AND client_id IN (${clientIds.map(() => '?').join(',')})
    `).all(kind, ...clientIds);
    for (const c of found) checks.set(`${c.client_id}|${c.url}`, c.status);
  }
  const stats = await loadAssociateIssueStats(db, users.map((u) => u.id));

  const byUser = new Map(users.map((u) => [u.id, { id: u.id, name: u.name, total: 0, stats: stats[u.id], clients: new Map() }]));
  for (const r of rows) {
    const u = byUser.get(r.associate_id);
    if (!u) continue;
    if (!u.clients.has(r.client_id)) u.clients.set(r.client_id, { clientId: r.client_id, name: r.client_name, types: [] });
    u.clients.get(r.client_id).types.push({
      type: r.link_type,
      count: r.completed_count,
      links: (r.links || []).map((url) => ({ url, status: checks.get(`${r.client_id}|${url}`) || '' })),
    });
    u.total += r.completed_count;
  }
  return [...byUser.values()].map((u) => ({ ...u, clients: [...u.clients.values()] }));
}
