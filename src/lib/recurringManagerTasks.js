import { getDb } from './db';

/**
 * Spawns today's occurrence of every active recurring Manager Task template
 * whose weekdays include today. Each occurrence is an ordinary manager_tasks
 * row (due today at the template's due_time) with one manager_task_assignees
 * row per template assignee, so submission, late-approval, and the nav dot all
 * work exactly like a one-off task with no special-casing.
 *
 * Idempotent and safe to call from anywhere/concurrently: the unique index on
 * (template_id, due_date) turns a repeat spawn into a no-op. Called lazily
 * from the pages/pollers that read manager tasks (so it works with no cron at
 * all) and from a daily cron as a backstop. Only ever spawns for TODAY — a
 * day nobody loaded the app is not backfilled.
 */
export async function ensureRecurringManagerTasks() {
  const db = await getDb();
  const today = new Date().toISOString().split('T')[0];
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();

  const templates = await db.prepare(`
    SELECT id, task_text, weekdays, due_time, created_by
    FROM manager_task_templates WHERE is_active = 1
  `).all();

  let spawned = 0;
  for (const t of templates) {
    const days = String(t.weekdays).split(',').map((d) => parseInt(d, 10));
    if (!days.includes(weekday)) continue;

    const result = await db.prepare(`
      INSERT OR IGNORE INTO manager_tasks (task_text, due_date, due_time, created_by, template_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(t.task_text, today, t.due_time, t.created_by, t.id);
    if (!result.changes) continue; // already spawned for today

    const taskId = result.lastInsertRowid;
    const assignees = await db.prepare(`
      SELECT ta.user_id FROM manager_task_template_assignees ta
      JOIN users u ON u.id = ta.user_id
      WHERE ta.template_id = ? AND u.is_active = 1
    `).all(t.id);
    for (const a of assignees) {
      await db.prepare(`
        INSERT OR IGNORE INTO manager_task_assignees (task_id, user_id) VALUES (?, ?)
      `).run(taskId, a.user_id);
    }
    spawned++;
  }
  return spawned;
}
