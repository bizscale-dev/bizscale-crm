// Support portal.
//  - Tasks to Tech: Support -> admin -> the admin forwards it to one or more SEO / Web SEO managers as
//    an ordinary manager task (proof, late approval and so on work like any other task).
//  - Queries: manager -> admin -> the admin approves and picks one or more support people -> their
//    replies go straight to the manager. A query is not a task.
import { createNotificationsForUsers } from '@/lib/notifications';

// The managers who take part: Web SEO managers and the SEO manager.
export const SUPPORT_MANAGER_ROLES = ['web_seo_manager', 'seo_manager'];

export const ROLE_LABELS = { web_seo_manager: 'Web SEO Manager', seo_manager: 'SEO Manager' };

export function supportLinkForRole(role) {
  if (role === 'seo_manager') return '/seo-manager/support';
  if (role === 'web_seo_manager') return '/web-seo-manager/support';
  if (role === 'support') return '/support';
  return '/admin/support';
}

export async function getActiveUsersByRole(db, roles) {
  return db.prepare(`
    SELECT id, name, role FROM users WHERE is_active = 1 AND role IN (${roles.map(() => '?').join(',')}) ORDER BY role, name
  `).all(...roles);
}

// The clients that can be picked: the active clients of the active SEO campaign (synced from the SEO
// client sheet).
export async function getSeoClientNames(db) {
  const rows = await db.prepare(`
    SELECT TRIM(c.name) AS name FROM clients c
    WHERE c.is_active = 1 AND c.campaign_id = (SELECT id FROM campaigns WHERE status = 'active' ORDER BY id DESC LIMIT 1)
    ORDER BY LOWER(TRIM(c.name))
  `).all();
  return [...new Set(rows.map((r) => r.name).filter(Boolean))];
}

export async function notifyAdmins(db, { title, message }) {
  const admins = await getActiveUsersByRole(db, ['admin']);
  await createNotificationsForUsers(db, admins.map((a) => a.id), { title, message, link: '/admin/support' });
}

// Tells the support person when a manager submits a task that came from them. Never allowed to break
// the manager's submission.
export async function notifySupportTaskSubmitted(db, managerTaskId, managerId) {
  try {
    const task = await db.prepare('SELECT created_by, task_text FROM support_tasks WHERE manager_task_id = ?').get(managerTaskId);
    if (!task) return;
    const manager = await db.prepare('SELECT name FROM users WHERE id = ?').get(managerId);
    await createNotificationsForUsers(db, [task.created_by], {
      title: 'Task submitted',
      message: `${manager?.name || 'A manager'} submitted: ${task.task_text.slice(0, 120)}`,
      link: '/support/tasks',
    });
  } catch (err) {
    console.error('[Support] notifySupportTaskSubmitted failed:', err);
  }
}

const inList = (ids) => ids.map(() => '?').join(',');

/**
 * Support tasks, newest first, each with the managers it was forwarded to and where each one stands.
 * `createdBy` limits to one support person's own tasks.
 */
export async function loadSupportTasks(db, { createdBy } = {}) {
  const tasks = await db.prepare(`
    SELECT s.id, s.client_name, s.task_text, s.urgency, s.due_date, s.due_time, s.status, s.admin_note, s.manager_task_id,
      s.created_at, s.reviewed_at, u.name AS from_name,
      t.task_text AS sent_text, t.due_date AS sent_due_date, t.due_time AS sent_due_time, t.urgency AS sent_urgency
    FROM support_tasks s
    LEFT JOIN users u ON u.id = s.created_by
    LEFT JOIN manager_tasks t ON t.id = s.manager_task_id
    ${createdBy ? 'WHERE s.created_by = ?' : ''}
    ORDER BY s.id DESC LIMIT 200
  `).all(...(createdBy ? [createdBy] : []));

  const ids = tasks.map((t) => t.manager_task_id).filter(Boolean);
  const assignees = ids.length ? await db.prepare(`
    SELECT a.id, a.task_id, u.name, u.role, a.submitted_at, a.submission_description, a.is_late, a.late_reason,
      a.approval_status, (a.proof_image_base64 IS NOT NULL AND a.proof_image_base64 != '') AS has_proof
    FROM manager_task_assignees a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.task_id IN (${inList(ids)}) ORDER BY u.name
  `).all(...ids) : [];

  return tasks.map((t) => ({
    ...t,
    assignees: assignees.filter((a) => a.task_id === t.manager_task_id).map((a) => ({
      id: a.id, name: a.name || 'Removed user', role: a.role,
      submitted_at: a.submitted_at, description: a.submission_description,
      is_late: a.is_late, late_reason: a.late_reason, approval_status: a.approval_status,
      proof_url: a.has_proof ? `/api/manager-task-proof/${a.id}` : null,
    })),
  }));
}

/**
 * Queries, newest first, with who they went to and the replies.
 * `createdBy` = a manager's own queries; `recipient` = the approved queries sent to one support person.
 */
export async function loadSupportQueries(db, { createdBy, recipient } = {}) {
  let where = '';
  const args = [];
  if (createdBy) { where = 'WHERE q.created_by = ?'; args.push(createdBy); }
  if (recipient) {
    where = "WHERE q.status = 'approved' AND EXISTS (SELECT 1 FROM support_query_recipients r WHERE r.query_id = q.id AND r.user_id = ?)";
    args.push(recipient);
  }
  const queries = await db.prepare(`
    SELECT q.id, q.client_name, q.query_text, q.status, q.admin_note, q.created_at, q.reviewed_at, u.name AS from_name, u.role AS from_role
    FROM support_queries q LEFT JOIN users u ON u.id = q.created_by
    ${where} ORDER BY q.id DESC LIMIT 200
  `).all(...args);
  if (queries.length === 0) return [];

  const ids = queries.map((q) => q.id);
  const recipients = await db.prepare(`
    SELECT r.query_id, u.name FROM support_query_recipients r LEFT JOIN users u ON u.id = r.user_id
    WHERE r.query_id IN (${inList(ids)}) ORDER BY u.name
  `).all(...ids);
  const replies = await db.prepare(`
    SELECT p.id, p.query_id, p.reply_text, p.created_at, p.seen_at, u.name
    FROM support_query_replies p LEFT JOIN users u ON u.id = p.user_id
    WHERE p.query_id IN (${inList(ids)}) ORDER BY p.id
  `).all(...ids);

  return queries.map((q) => ({
    ...q,
    sentTo: recipients.filter((r) => r.query_id === q.id).map((r) => r.name || 'Removed user'),
    replies: replies.filter((p) => p.query_id === q.id).map((p) => ({
      id: p.id, name: p.name || 'Removed user', text: p.reply_text, created_at: p.created_at, isNew: !p.seen_at,
    })),
  }));
}
