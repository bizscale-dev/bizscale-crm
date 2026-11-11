import { getDb } from './db';
import { createNotificationsForUsers, getTasksLinkForRole } from './notifications';

/**
 * Spawns today's occurrence of every active recurring Associate Task template
 * whose start weekday (weekdays — a single day despite the column's plural
 * name) is today. One tier down from ensureRecurringManagerTasks (same file
 * shape, same due-date math) — a manager's recurring task for their own
 * role's associates, instead of admin's for managers.
 *
 * Idempotent and safe to call from anywhere/concurrently: the unique index on
 * (template_id, due_date) turns a repeat spawn into a no-op. Called lazily
 * from the pages/pollers that read associate tasks (so it works with no cron
 * at all). Only ever spawns for TODAY — a day nobody loaded the app is not
 * backfilled.
 */
export async function ensureRecurringAssociateTasks() {
  const db = await getDb();
  const today = new Date().toISOString().split('T')[0];
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();

  const templates = await db.prepare(`
    SELECT id, task_text, weekdays, duration_days, due_time, created_by, urgency, kind, month_day, spawn_day
    FROM associate_task_templates WHERE is_active = 1
  `).all();

  let spawned = 0;
  for (const t of templates) {
    if (t.kind === 'monthly_clients') {
      if (await spawnMonthlyClientTask(db, t, today)) spawned++;
      continue;
    }
    const startWeekday = parseInt(String(t.weekdays).split(',')[0], 10);
    if (startWeekday !== weekday) continue;

    const dueDate = new Date(`${today}T00:00:00Z`);
    dueDate.setUTCDate(dueDate.getUTCDate() + Math.max(1, t.duration_days || 1) - 1);
    const dueDateStr = dueDate.toISOString().split('T')[0];

    const result = await db.prepare(`
      INSERT OR IGNORE INTO associate_tasks (task_text, due_date, due_time, created_by, template_id, urgency)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(t.task_text, dueDateStr, t.due_time, t.created_by, t.id, t.urgency || 'moderate');
    if (!result.changes) continue; // already spawned for this occurrence

    const taskId = result.lastInsertRowid;
    const assignees = await db.prepare(`
      SELECT ta.user_id, u.role FROM associate_task_template_assignees ta
      JOIN users u ON u.id = ta.user_id
      WHERE ta.template_id = ? AND u.is_active = 1
    `).all(t.id);
    const byRole = new Map();
    for (const a of assignees) {
      await db.prepare(`
        INSERT OR IGNORE INTO associate_task_assignees (task_id, user_id) VALUES (?, ?)
      `).run(taskId, a.user_id);
      if (!byRole.has(a.role)) byRole.set(a.role, []);
      byRole.get(a.role).push(a.user_id);
    }
    for (const [role, userIds] of byRole.entries()) {
      await createNotificationsForUsers(db, userIds, {
        title: 'New Task from Manager',
        message: `${t.task_text.slice(0, 140)} — due ${dueDateStr} ${t.due_time}`,
        link: getTasksLinkForRole(role === 'senior_seo_associate' ? 'seo_associate' : role),
      });
    }
    spawned++;
  }
  return spawned;
}

/**
 * One occurrence of a monthly "check every client" template: appears from spawn_day of the month and is
 * due on month_day. Every active SEO / Senior SEO associate assigned to the active campaign gets it with
 * their own client list (the clients they have SEO tasks for). Idempotent: (template_id, due_date) is unique,
 * so repeat calls on later days of the window do nothing.
 */
async function spawnMonthlyClientTask(db, t, today) {
  const day = parseInt(today.slice(8, 10), 10);
  const dueDay = t.month_day || 1;
  if (day < (t.spawn_day || 1) || day > dueDay) return false;
  const dueDateStr = `${today.slice(0, 8)}${String(dueDay).padStart(2, '0')}`;

  const campaign = await db.prepare(`
    SELECT COALESCE(
      (SELECT id FROM campaigns WHERE status = 'active' ORDER BY id DESC LIMIT 1),
      (SELECT id FROM campaigns ORDER BY id DESC LIMIT 1)) AS id
  `).get();
  if (!campaign?.id) return false;

  const people = await db.prepare(`
    SELECT u.id, u.role
    FROM users u JOIN associate_assignments a ON a.user_id = u.id AND a.campaign_id = ?
    WHERE u.is_active = 1 AND u.role IN ('seo_associate', 'senior_seo_associate')
  `).all(campaign.id);

  const rows = [];
  for (const p of people) {
    // The clients this associate actually works on: the ones they have SEO tasks for in the active
    // campaign (their assigned range alone covers every client, so it cannot tell them apart).
    const clients = await db.prepare(`
      SELECT TRIM(c.name) AS name FROM clients c
      WHERE c.campaign_id = ? AND c.is_active = 1
        AND c.id IN (SELECT DISTINCT client_id FROM seo_tasks WHERE campaign_id = ? AND associate_id = ?)
      ORDER BY c.sort_order, c.id
    `).all(campaign.id, campaign.id, p.id);
    if (clients.length > 0) rows.push({ ...p, checklist: JSON.stringify(clients.map((c) => c.name)) });
  }
  if (rows.length === 0) return false;

  const result = await db.prepare(`
    INSERT OR IGNORE INTO associate_tasks (task_text, due_date, due_time, created_by, template_id, urgency, kind)
    VALUES (?, ?, ?, ?, ?, ?, 'monthly_clients')
  `).run(t.task_text, dueDateStr, t.due_time, t.created_by, t.id, t.urgency || 'moderate');
  if (!result.changes) return false;

  const taskId = result.lastInsertRowid;
  for (const p of rows) {
    await db.prepare('INSERT OR IGNORE INTO associate_task_assignees (task_id, user_id, checklist) VALUES (?, ?, ?)')
      .run(taskId, p.id, p.checklist);
  }
  await createNotificationsForUsers(db, rows.map((p) => p.id), {
    title: 'New Task from Manager',
    message: `${t.task_text.slice(0, 140)} — due ${dueDateStr} ${t.due_time}`,
    link: getTasksLinkForRole('seo_associate'),
  });
  return true;
}
