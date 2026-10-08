import { getDb } from './db';

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
    SELECT id, task_text, weekdays, duration_days, due_time, created_by
    FROM associate_task_templates WHERE is_active = 1
  `).all();

  let spawned = 0;
  for (const t of templates) {
    const startWeekday = parseInt(String(t.weekdays).split(',')[0], 10);
    if (startWeekday !== weekday) continue;

    const dueDate = new Date(`${today}T00:00:00Z`);
    dueDate.setUTCDate(dueDate.getUTCDate() + Math.max(1, t.duration_days || 1) - 1);
    const dueDateStr = dueDate.toISOString().split('T')[0];

    const result = await db.prepare(`
      INSERT OR IGNORE INTO associate_tasks (task_text, due_date, due_time, created_by, template_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(t.task_text, dueDateStr, t.due_time, t.created_by, t.id);
    if (!result.changes) continue; // already spawned for this occurrence

    const taskId = result.lastInsertRowid;
    const assignees = await db.prepare(`
      SELECT ta.user_id FROM associate_task_template_assignees ta
      JOIN users u ON u.id = ta.user_id
      WHERE ta.template_id = ? AND u.is_active = 1
    `).all(t.id);
    for (const a of assignees) {
      await db.prepare(`
        INSERT OR IGNORE INTO associate_task_assignees (task_id, user_id) VALUES (?, ?)
      `).run(taskId, a.user_id);
    }
    spawned++;
  }
  return spawned;
}
