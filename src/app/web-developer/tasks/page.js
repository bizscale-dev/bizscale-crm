import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import ManagerTasksClient from '../../web-associate/manager-tasks/ManagerTasksClient';
import { ensureRecurringAssociateTasks } from '@/lib/recurringAssociateTasks';

export const revalidate = 0;

// Tasks the Web SEO managers assign to the Web Developer - SEO (associate_tasks, the same
// tables a Web SEO associate's tasks live in), submitted with the same proof/late flow.
export default async function WebDeveloperTasksPage() {
  const session = await verifySession();
  await ensureRecurringAssociateTasks();
  const db = await getDb();

  const tasks = await db.prepare(`
    SELECT t.id as task_id, t.task_text, t.due_date, t.due_time,
      a.submitted_at, a.submission_description, a.proof_image_base64,
      a.is_late, a.late_reason, a.approval_status, t.template_id, t.urgency
    FROM associate_task_assignees a
    JOIN associate_tasks t ON t.id = a.task_id
    WHERE a.user_id = ?
    ORDER BY t.due_date ASC, t.due_time ASC
  `).all(session.userId);

  // Opening this page IS "reading" a just-arrived review result — clears the nav dot.
  await db.prepare(`
    UPDATE associate_task_assignees SET review_seen = 1 WHERE user_id = ? AND review_seen = 0
  `).run(session.userId);

  return <ManagerTasksClient tasks={tasks} urgencyFilter twelveHour />;
}
