import { getDb } from '@/lib/db';
import ManagerTasksClient from './ManagerTasksClient';

export const revalidate = 0;

const ROLE_LABELS = {
  seo_manager: 'SEO Manager',
  web_seo_manager: 'Web SEO Manager',
  writers_manager: 'Writers Manager',
};

export default async function ManagerTasksPage() {
  const db = await getDb();

  const managers = await db.prepare(`
    SELECT id, name, role FROM users
    WHERE role IN ('seo_manager','web_seo_manager','writers_manager') AND is_active = 1
    ORDER BY role, name
  `).all();

  const rows = await db.prepare(`
    SELECT t.id as task_id, t.task_text, t.due_date, t.due_time, t.created_at,
      a.id as assignee_row_id, a.user_id, u.name as manager_name, u.role as manager_role,
      a.submitted_at, a.submission_description, a.proof_image_base64,
      a.is_late, a.late_reason, a.approval_status
    FROM manager_tasks t
    JOIN manager_task_assignees a ON a.task_id = t.id
    JOIN users u ON u.id = a.user_id
    ORDER BY t.created_at DESC, u.name ASC
  `).all();

  // Group the flat joined rows back into { task, assignees: [...] } shapes, same
  // "fetch flat, group in JS" style used by EodReportClient's per-report grouping.
  const byTask = new Map();
  for (const row of rows) {
    if (!byTask.has(row.task_id)) {
      byTask.set(row.task_id, {
        id: row.task_id,
        task_text: row.task_text,
        due_date: row.due_date,
        due_time: row.due_time,
        created_at: row.created_at,
        assignees: [],
      });
    }
    byTask.get(row.task_id).assignees.push({
      id: row.assignee_row_id,
      user_id: row.user_id,
      name: row.manager_name,
      role: row.manager_role,
      submitted_at: row.submitted_at,
      submission_description: row.submission_description,
      proof_image_base64: row.proof_image_base64,
      is_late: row.is_late,
      late_reason: row.late_reason,
      approval_status: row.approval_status,
    });
  }

  return (
    <ManagerTasksClient
      managers={managers.map((m) => ({ ...m, roleLabel: ROLE_LABELS[m.role] || m.role }))}
      tasks={[...byTask.values()]}
      roleLabels={ROLE_LABELS}
    />
  );
}
