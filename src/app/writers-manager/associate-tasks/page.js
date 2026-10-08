import { getDb } from '@/lib/db';
import AssociateTasksClient from './AssociateTasksClient';
import { ensureRecurringAssociateTasks } from '@/lib/recurringAssociateTasks';

export const revalidate = 0;

const ASSOCIATE_ROLE = 'writer';

export default async function WritersManagerAssociateTasksPage() {
  await ensureRecurringAssociateTasks();
  const db = await getDb();

  const associates = await db.prepare(`
    SELECT id, name FROM users WHERE role = ? AND is_active = 1 ORDER BY name
  `).all(ASSOCIATE_ROLE);

  const rows = await db.prepare(`
    SELECT t.id as task_id, t.task_text, t.due_date, t.due_time, t.created_at, t.template_id,
      a.id as assignee_row_id, a.user_id, u.name as associate_name,
      a.submitted_at, a.submission_description, a.proof_image_base64,
      a.is_late, a.late_reason, a.approval_status
    FROM associate_tasks t
    JOIN associate_task_assignees a ON a.task_id = t.id
    JOIN users u ON u.id = a.user_id
    WHERE u.role = ?
    ORDER BY t.created_at DESC, u.name ASC
  `).all(ASSOCIATE_ROLE);

  const byTask = new Map();
  for (const row of rows) {
    if (!byTask.has(row.task_id)) {
      byTask.set(row.task_id, {
        id: row.task_id,
        task_text: row.task_text,
        due_date: row.due_date,
        due_time: row.due_time,
        created_at: row.created_at,
        template_id: row.template_id,
        assignees: [],
      });
    }
    byTask.get(row.task_id).assignees.push({
      id: row.assignee_row_id,
      user_id: row.user_id,
      name: row.associate_name,
      submitted_at: row.submitted_at,
      submission_description: row.submission_description,
      proof_image_base64: row.proof_image_base64,
      is_late: row.is_late,
      late_reason: row.late_reason,
      approval_status: row.approval_status,
    });
  }

  const templateRows = await db.prepare(`
    SELECT t.id, t.task_text, t.weekdays, t.duration_days, t.due_time, t.is_active,
      (SELECT GROUP_CONCAT(u.name, ', ') FROM associate_task_template_assignees ta
        JOIN users u ON u.id = ta.user_id WHERE ta.template_id = t.id) as assignee_names
    FROM associate_task_templates t
    WHERE EXISTS (
      SELECT 1 FROM associate_task_template_assignees ta
      JOIN users u ON u.id = ta.user_id WHERE ta.template_id = t.id AND u.role = ?
    )
    ORDER BY t.created_at DESC
  `).all(ASSOCIATE_ROLE);

  return (
    <AssociateTasksClient
      templates={templateRows}
      associates={associates}
      tasks={[...byTask.values()]}
    />
  );
}
