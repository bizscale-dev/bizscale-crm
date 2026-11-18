import { getDb } from '@/lib/db';
import ManagerTasksView from './ManagerTasksView';

export const revalidate = 0;

export default async function QaManagerTasksPage() {
  const db = await getDb();

  const rows = await db.prepare(`
    SELECT t.id as task_id, t.task_text, t.due_date, t.due_time, t.template_id, t.urgency, t.is_default,
      a.id as assignee_id, u.id as manager_id, u.name as manager_name, u.role as manager_role,
      a.submitted_at, a.submission_description, (a.proof_image_base64 IS NOT NULL AND a.proof_image_base64 != '') AS has_proof,
      a.is_late, a.late_reason, a.approval_status
    FROM manager_tasks t
    JOIN manager_task_assignees a ON a.task_id = t.id
    JOIN users u ON u.id = a.user_id
    ORDER BY t.due_date DESC, u.name ASC
  `).all();

  // Graphics Designers' tasks live in the associate tier; show them here too (read-only: reporting
  // is tied to manager task ids).
  const designerRows = await db.prepare(`
    SELECT t.id as task_id, t.task_text, t.due_date, t.due_time, t.template_id, t.urgency, 0 as is_default,
      a.id as assignee_id, u.id as manager_id, u.name as manager_name, u.role as manager_role,
      a.submitted_at, a.submission_description, (a.proof_image_base64 IS NOT NULL AND a.proof_image_base64 != '') AS has_proof,
      a.is_late, a.late_reason, a.approval_status,
      cb.name as assigned_by_name, cb.role as assigned_by_role, 1 as from_associate
    FROM associate_tasks t
    JOIN associate_task_assignees a ON a.task_id = t.id
    JOIN users u ON u.id = a.user_id
    LEFT JOIN users cb ON cb.id = t.created_by
    WHERE u.role = 'graphic_designer'
  `).all();
  for (const r of designerRows) r.assignee_id = `a${r.assignee_id}`;
  rows.push(...designerRows);
  rows.sort((x, y) => (y.due_date > x.due_date ? 1 : y.due_date < x.due_date ? -1 : x.manager_name.localeCompare(y.manager_name)));

  const counts = await db.prepare(`
    SELECT task_assignee_id, COUNT(*) as c FROM qa_reports
    WHERE source = 'manager_task' GROUP BY task_assignee_id
  `).all();
  const reportCounts = {};
  for (const c of counts) reportCounts[c.task_assignee_id] = c.c;

  return <ManagerTasksView rows={rows} initialReportCounts={reportCounts} />;
}
