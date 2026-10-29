import { getDb } from '@/lib/db';
import ManagerTasksView from './ManagerTasksView';

export const revalidate = 0;

export default async function QaManagerTasksPage() {
  const db = await getDb();

  const rows = await db.prepare(`
    SELECT t.id as task_id, t.task_text, t.due_date, t.due_time, t.template_id, t.urgency, t.is_default,
      a.id as assignee_id, u.id as manager_id, u.name as manager_name, u.role as manager_role,
      a.submitted_at, a.submission_description, a.proof_image_base64,
      a.is_late, a.late_reason, a.approval_status
    FROM manager_tasks t
    JOIN manager_task_assignees a ON a.task_id = t.id
    JOIN users u ON u.id = a.user_id
    ORDER BY t.due_date DESC, u.name ASC
  `).all();

  const counts = await db.prepare(`
    SELECT task_assignee_id, COUNT(*) as c FROM qa_reports
    WHERE source = 'manager_task' GROUP BY task_assignee_id
  `).all();
  const reportCounts = {};
  for (const c of counts) reportCounts[c.task_assignee_id] = c.c;

  return <ManagerTasksView rows={rows} initialReportCounts={reportCounts} />;
}
