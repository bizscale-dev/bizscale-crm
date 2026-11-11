import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import AssignTasksClient from './AssignTasksClient';
import { MANAGER_TIER_ROLES, ASSOCIATE_TIER_ROLES } from './roles';

export const revalidate = 0;

export default async function QaAssignTasksPage() {
  const session = await verifySession();
  const db = await getDb();

  const roles = [...MANAGER_TIER_ROLES, ...ASSOCIATE_TIER_ROLES];
  const people = await db.prepare(`
    SELECT id, name, role FROM users WHERE is_active = 1 AND role IN (${roles.map(() => '?').join(',')}) ORDER BY name
  `).all(...roles);

  // Everything this QA user assigned, both task systems, newest first, with each person's progress.
  const load = (table, assignees) => db.prepare(`
    SELECT t.id AS task_id, t.task_text, t.due_date, t.due_time, t.urgency, t.created_at,
      a.user_id, u.name AS user_name, u.role AS user_role, a.submitted_at, a.submission_description, a.is_late
    FROM ${table} t
    JOIN ${assignees} a ON a.task_id = t.id
    JOIN users u ON u.id = a.user_id
    WHERE t.created_by = ?
    ORDER BY t.created_at DESC, t.id DESC, u.name ASC
    LIMIT 600
  `).all(session.userId);

  const rows = [
    ...(await load('manager_tasks', 'manager_task_assignees')).map((r) => ({ ...r, tier: 'm' })),
    ...(await load('associate_tasks', 'associate_task_assignees')).map((r) => ({ ...r, tier: 'a' })),
  ];

  const byTask = new Map();
  for (const r of rows) {
    const key = `${r.tier}-${r.task_id}`;
    if (!byTask.has(key)) {
      byTask.set(key, { key, task_text: r.task_text, due_date: r.due_date, due_time: r.due_time, urgency: r.urgency, created_at: r.created_at, assignees: [] });
    }
    byTask.get(key).assignees.push({
      id: r.user_id, name: r.user_name, role: r.user_role,
      submitted_at: r.submitted_at, description: r.submission_description, is_late: !!r.is_late,
    });
  }
  const tasks = [...byTask.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  return <AssignTasksClient people={people} tasks={tasks} />;
}
