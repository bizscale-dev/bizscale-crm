import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import TasksClient from './TasksClient';

export const revalidate = 0;

export default async function WebSeoManagerTasksPage() {
  const session = await verifySession();
  const db = await getDb();

  const tasks = await db.prepare(`
    SELECT t.id as task_id, t.task_text, t.due_date, t.due_time,
      a.submitted_at, a.submission_description, a.proof_image_base64,
      a.is_late, a.late_reason, a.approval_status
    FROM manager_task_assignees a
    JOIN manager_tasks t ON t.id = a.task_id
    WHERE a.user_id = ?
    ORDER BY t.due_date ASC, t.due_time ASC
  `).all(session.userId);

  return <TasksClient tasks={tasks} />;
}
