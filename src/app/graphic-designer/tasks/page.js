import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { proofUrls } from '@/lib/multiImages';
import ManagerTasksClient from '../../web-associate/manager-tasks/ManagerTasksClient';
import { ensureRecurringAssociateTasks } from '@/lib/recurringAssociateTasks';

export const revalidate = 0;

// Tasks assigned to the Graphics Designer, submitted with the same proof/late flow as the other associates.
export default async function TasksPage() {
  const session = await verifySession();
  await ensureRecurringAssociateTasks();
  const db = await getDb();

  const tasks = await db.prepare(`
    SELECT t.id as task_id, t.task_text, t.due_date, t.due_time,
      a.id AS assignee_row_id, a.submitted_at, a.submission_description, (a.proof_image_base64 IS NOT NULL AND a.proof_image_base64 != '') AS has_proof, CASE WHEN a.extra_proof_images IS NULL OR a.extra_proof_images = '' THEN 0 ELSE json_array_length(a.extra_proof_images) END AS extra_count,
      a.is_late, a.late_reason, a.approval_status, t.template_id, t.urgency, (SELECT role FROM users WHERE id = t.created_by) = 'qa' AS by_qa,  (t.attachment_base64 IS NOT NULL AND t.attachment_base64 != '') AS has_attachment,
      m.name AS assigned_by
    FROM associate_task_assignees a
    JOIN associate_tasks t ON t.id = a.task_id
    LEFT JOIN users m ON m.id = t.created_by
    WHERE a.user_id = ?
    ORDER BY t.due_date ASC, t.due_time ASC
  `).all(session.userId);

  // Opening this page IS "reading" a just-arrived review result — clears the nav dot.
  await db.prepare(`
    UPDATE associate_task_assignees SET review_seen = 1 WHERE user_id = ? AND review_seen = 0
  `).run(session.userId);

  return <ManagerTasksClient tasks={tasks.map(({ has_proof, extra_count, ...t }) => ({ ...t, proof_urls: proofUrls('/api/task-proof', t.assignee_row_id, !!has_proof, extra_count) }))} urgencyFilter twelveHour />;
}
