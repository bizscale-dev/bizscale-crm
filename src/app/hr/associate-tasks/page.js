import { getDb } from '@/lib/db';
import AssociateTasksView from './AssociateTasksView';

export const revalidate = 0;

export default async function HrAssociateTasksPage() {
  const db = await getDb();

  // Every manager -> associate assignment across all 3 associate roles —
  // associate_tasks already only ever holds this one kind of assignment
  // (see src/lib/db.js), no role filter needed.
  const rows = await db.prepare(`
    SELECT t.id as task_id, t.task_text, t.due_date, t.due_time, t.template_id,
      a.id as assignee_id, u.id as associate_id, u.name as associate_name, u.role as associate_role,
      m.name as assigned_by,
      a.submitted_at, a.submission_description, a.proof_image_base64,
      a.is_late, a.late_reason, a.approval_status
    FROM associate_tasks t
    JOIN associate_task_assignees a ON a.task_id = t.id
    JOIN users u ON u.id = a.user_id
    JOIN users m ON m.id = t.created_by
    ORDER BY t.due_date DESC, u.name ASC
  `).all();

  return <AssociateTasksView rows={rows} />;
}
