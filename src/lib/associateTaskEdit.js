import { createNotificationsForUsers, getTasksLinkForRole } from '@/lib/notifications';
import { parseUrgency } from '@/lib/taskUrgency';

// Shared by the Associate Tasks actions of every manager / executive who assigns tasks (SEO, Web SEO,
// Writers, Graphic Designer Executive): changing or removing a task they assigned. Only the person who
// created the task can touch it, and the people it was assigned to are told about an edit.

async function loadOwnTask(db, session, taskId) {
  const id = parseInt(taskId, 10);
  if (!id) return null;
  return db.prepare('SELECT id, task_text, created_by FROM associate_tasks WHERE id = ? AND created_by = ?')
    .get(id, session.userId);
}

export async function updateOwnAssociateTask(db, session, taskId, fields) {
  const task = await loadOwnTask(db, session, taskId);
  if (!task) return { error: 'Task not found, or you did not assign it' };

  const taskText = String(fields?.taskText || '').trim();
  const dueDate = String(fields?.dueDate || '').trim();
  const dueTime = String(fields?.dueTime || '').trim();
  if (!taskText) return { error: 'Task description is required' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { error: 'Due date is required' };
  if (!/^\d{2}:\d{2}/.test(dueTime)) return { error: 'Due time is required' };

  await db.prepare(`
    UPDATE associate_tasks SET task_text = ?, due_date = ?, due_time = ?, urgency = ? WHERE id = ?
  `).run(taskText, dueDate, dueTime, parseUrgency(fields?.urgency), task.id);

  const people = await db.prepare(`
    SELECT u.id, u.role FROM associate_task_assignees a JOIN users u ON u.id = a.user_id
    WHERE a.task_id = ? AND u.is_active = 1
  `).all(task.id);
  const byRole = new Map();
  for (const p of people) {
    if (!byRole.has(p.role)) byRole.set(p.role, []);
    byRole.get(p.role).push(p.id);
  }
  for (const [role, ids] of byRole.entries()) {
    await createNotificationsForUsers(db, ids, {
      title: 'Task updated',
      message: `${taskText.slice(0, 140)} — due ${dueDate} ${dueTime}`,
      link: getTasksLinkForRole(role === 'senior_seo_associate' ? 'seo_associate' : role),
    });
  }
  return { success: true };
}

export async function deleteOwnAssociateTask(db, session, taskId) {
  const task = await loadOwnTask(db, session, taskId);
  if (!task) return { error: 'Task not found, or you did not assign it' };

  // Assignees go with the task (ON DELETE CASCADE); the Executive's pass/fail marks are keyed by task id.
  await db.prepare('DELETE FROM task_checks WHERE task_id = ?').run(task.id);
  await db.prepare('DELETE FROM associate_task_assignees WHERE task_id = ?').run(task.id);
  await db.prepare('DELETE FROM associate_tasks WHERE id = ?').run(task.id);
  return { success: true };
}
