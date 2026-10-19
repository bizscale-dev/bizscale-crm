import { getDb } from '@/lib/db';
import ManagerTasksView from './ManagerTasksView';

export const revalidate = 0;

export default async function QaManagerTasksPage() {
  const db = await getDb();

  const rows = await db.prepare(`
    SELECT t.id as task_id, t.task_text, t.due_date, t.due_time, t.template_id,
      a.id as assignee_id, u.id as manager_id, u.name as manager_name, u.role as manager_role,
      a.submitted_at, a.submission_description, a.proof_image_base64,
      a.is_late, a.late_reason, a.approval_status
    FROM manager_tasks t
    JOIN manager_task_assignees a ON a.task_id = t.id
    JOIN users u ON u.id = a.user_id
    ORDER BY t.due_date DESC, u.name ASC
  `).all();

  return <ManagerTasksView rows={rows} />;
}
