// Shared by the SEO and Web SEO associates: ticks / unticks one client of a "check every client" task
// (kind = 'monthly_clients', e.g. the ranking checks). The task submits itself once every client is ticked:
// the description lists the clients, and a task finished after its due time goes to the manager for approval
// like any other late one.
export async function applyClientCheck(db, userId, taskId, index, checked) {
  const id = parseInt(taskId, 10);
  const idx = parseInt(index, 10);
  if (!id || Number.isNaN(idx) || idx < 0) return { error: 'Invalid item' };

  const row = await db.prepare(`
    SELECT a.id, a.submitted_at, a.checklist, a.checklist_done, t.kind, t.task_text, t.due_date, t.due_time
    FROM associate_task_assignees a JOIN associate_tasks t ON t.id = a.task_id
    WHERE a.task_id = ? AND a.user_id = ?
  `).get(id, userId);
  if (!row || row.kind !== 'monthly_clients') return { error: 'This task is not assigned to you' };
  if (row.submitted_at) return { error: 'This task is already done' };

  let clients = [];
  try { clients = JSON.parse(row.checklist || '[]'); } catch { clients = []; }
  if (!Array.isArray(clients) || idx >= clients.length) return { error: 'Invalid client' };

  let done = [];
  try { done = JSON.parse(row.checklist_done || '[]'); } catch { done = []; }
  const set = new Set(Array.isArray(done) ? done : []);
  if (checked) set.add(idx); else set.delete(idx);
  const doneIdx = [...set].sort((a, b) => a - b);

  await db.prepare('UPDATE associate_task_assignees SET checklist_done = ? WHERE id = ?').run(JSON.stringify(doneIdx), row.id);

  let submitted = false;
  if (clients.length > 0 && doneIdx.length === clients.length) {
    const title = row.task_text.split(/\s+[—-]\s+/)[0].trim();
    const description = `${title}: all ${clients.length} clients checked\n${clients.map((n) => `✓ ${n}`).join('\n')}`;
    const dueAt = new Date(`${row.due_date}T${row.due_time}:00`);
    const isLate = Number.isNaN(dueAt.getTime()) ? false : new Date() > dueAt;
    await db.prepare(`
      UPDATE associate_task_assignees
      SET submission_description = ?, submitted_at = CURRENT_TIMESTAMP, is_late = ?, late_reason = ?, approval_status = ?
      WHERE id = ?
    `).run(description, isLate ? 1 : 0, isLate ? 'Last client was checked after the due time' : null, isLate ? 'pending' : null, row.id);
    submitted = true;
  }
  return { success: true, submitted };
}
