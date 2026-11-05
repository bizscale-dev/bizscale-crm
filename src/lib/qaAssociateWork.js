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
 * What every associate of one kind ('seo' | 'web') completed on `date`:
 * [{ id, name, total, clients: [{ clientId, name, types: [{ type, count, links[] }] }] }].
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

  const byUser = new Map(users.map((u) => [u.id, { id: u.id, name: u.name, total: 0, clients: new Map() }]));
  for (const r of rows) {
    const u = byUser.get(r.associate_id);
    if (!u) continue;
    if (!u.clients.has(r.client_id)) u.clients.set(r.client_id, { clientId: r.client_id, name: r.client_name, types: [] });
    u.clients.get(r.client_id).types.push({ type: r.link_type, count: r.completed_count, links: r.links || [] });
    u.total += r.completed_count;
  }
  return [...byUser.values()].map((u) => ({ ...u, clients: [...u.clients.values()] }));
}
