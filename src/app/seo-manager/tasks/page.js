import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import TasksClient from './TasksClient';
import { ensureRecurringManagerTasks } from '@/lib/recurringManagerTasks';

export const revalidate = 0;

export default async function SeoManagerTasksPage() {
  const session = await verifySession();
  await ensureRecurringManagerTasks();
  const db = await getDb();

  const tasks = await db.prepare(`
    SELECT t.id as task_id, t.task_text, t.due_date, t.due_time,
      a.submitted_at, a.submission_description, a.proof_image_base64,
      a.is_late, a.late_reason, a.approval_status, t.template_id
    FROM manager_task_assignees a
    JOIN manager_tasks t ON t.id = a.task_id
    WHERE a.user_id = ?
    ORDER BY t.due_date ASC, t.due_time ASC
  `).all(session.userId);

  // Opening this page IS "reading" a just-arrived review result — clears the
  // nav dot that reviewTaskSubmission (admin/manager-tasks/actions.js) lit up.
  // Run after the fetch above so this page's own render still reflects
  // whatever just got marked seen; doesn't touch anything else.
  await db.prepare(`
    UPDATE manager_task_assignees SET review_seen = 1 WHERE user_id = ? AND review_seen = 0
  `).run(session.userId);

  return <TasksClient tasks={tasks} />;
}
