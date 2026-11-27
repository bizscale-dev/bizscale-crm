'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { parseUrgency } from '@/lib/taskUrgency';
import { createNotificationsForUsers, getTasksLinkForRole } from '@/lib/notifications';
import { SUPPORT_MANAGER_ROLES, supportLinkForRole, getActiveUsersByRole, getSeoClientNames, notifyAdmins } from '@/lib/support';
import { withClient } from '@/lib/supportText';

const MAX_TEXT = 5000;
const clean = (v) => String(v || '').trim();
const idList = (v) => [...new Set((Array.isArray(v) ? v : []).map((x) => parseInt(x, 10)).filter(Boolean))];

// The signed-in user, only if active and in one of `roles` (checked in the database, so a
// deactivated account or a changed role stops working straight away).
async function requireRole(roles) {
  const session = await verifySession();
  if (!session || !roles.includes(session.role)) return { error: 'Not authorized' };
  const db = await getDb();
  const user = await db.prepare('SELECT id, name, role FROM users WHERE id = ? AND is_active = 1').get(session.userId);
  if (!user || !roles.includes(user.role)) return { error: 'Not authorized' };
  return { db, user };
}

// The picked client, if any: must be on the SEO client list. `current` is the one already stored, which
// stays valid even after it leaves the list (for example when a new month's campaign starts).
async function resolveClient(db, value, current) {
  const name = clean(value);
  if (!name) return { client: null };
  if (name === current) return { client: current };
  const match = (await getSeoClientNames(db)).find((c) => c.toLowerCase() === name.toLowerCase());
  return match ? { client: match } : { error: 'Pick a client from the list' };
}

const about = (client) => (client ? `${client}: ` : '');

function checkTaskFields({ text, dueDate, dueTime }) {
  if (!clean(text)) return 'Describe the task';
  if (clean(text).length > MAX_TEXT) return `The task is too long (max ${MAX_TEXT} characters)`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(dueDate))) return 'Pick the due date';
  if (!/^\d{2}:\d{2}$/.test(clean(dueTime))) return 'Pick the due time';
  return null;
}

function refresh() {
  for (const path of ['/support', '/support/tasks', '/admin/support', '/admin/manager-tasks', '/seo-manager/support', '/web-seo-manager/support']) {
    revalidatePath(path);
  }
}

function fail(where, err) {
  console.error(`[Support] ${where} failed:`, err);
  return { error: 'Something went wrong — please try again.' };
}

/* ---------- Support person ---------- */

export async function createSupportTask({ text, dueDate, dueTime, urgency, clientName }) {
  const { db, user, error } = await requireRole(['support']);
  if (error) return { error };
  const problem = checkTaskFields({ text, dueDate, dueTime });
  if (problem) return { error: problem };
  try {
    const picked = await resolveClient(db, clientName);
    if (picked.error) return { error: picked.error };
    await db.prepare('INSERT INTO support_tasks (task_text, urgency, due_date, due_time, created_by, client_name) VALUES (?, ?, ?, ?, ?, ?)')
      .run(clean(text), parseUrgency(urgency), clean(dueDate), clean(dueTime), user.id, picked.client);
    await notifyAdmins(db, { title: 'New task from Support', message: `${user.name}: ${about(picked.client)}${clean(text).slice(0, 140)}` });
    refresh();
    return { success: true };
  } catch (err) {
    return fail('createSupportTask', err);
  }
}

export async function replyToSupportQuery(queryId, text) {
  const { db, user, error } = await requireRole(['support']);
  if (error) return { error };
  const id = parseInt(queryId, 10);
  const reply = clean(text);
  if (!reply) return { error: 'Write a reply' };
  if (reply.length > MAX_TEXT) return { error: `The reply is too long (max ${MAX_TEXT} characters)` };
  try {
    const query = await db.prepare(`
      SELECT q.id, q.created_by, u.role FROM support_queries q
      JOIN support_query_recipients r ON r.query_id = q.id AND r.user_id = ?
      LEFT JOIN users u ON u.id = q.created_by
      WHERE q.id = ? AND q.status = 'approved'
    `).get(user.id, id || 0);
    if (!query) return { error: 'This query was not sent to you' };
    await db.prepare('INSERT INTO support_query_replies (query_id, user_id, reply_text) VALUES (?, ?, ?)').run(query.id, user.id, reply);
    await createNotificationsForUsers(db, [query.created_by], {
      title: 'Support replied to your query', message: `${user.name}: ${reply.slice(0, 140)}`, link: supportLinkForRole(query.role),
    });
    refresh();
    return { success: true };
  } catch (err) {
    return fail('replyToSupportQuery', err);
  }
}

/* ---------- Manager ---------- */

export async function sendSupportQuery(text, clientName) {
  const { db, user, error } = await requireRole(SUPPORT_MANAGER_ROLES);
  if (error) return { error };
  const query = clean(text);
  if (!query) return { error: 'Write your query' };
  if (query.length > MAX_TEXT) return { error: `The query is too long (max ${MAX_TEXT} characters)` };
  try {
    const picked = await resolveClient(db, clientName);
    if (picked.error) return { error: picked.error };
    await db.prepare('INSERT INTO support_queries (query_text, created_by, client_name) VALUES (?, ?, ?)').run(query, user.id, picked.client);
    await notifyAdmins(db, { title: 'Query for Support needs approval', message: `${user.name}: ${about(picked.client)}${query.slice(0, 140)}` });
    refresh();
    return { success: true };
  } catch (err) {
    return fail('sendSupportQuery', err);
  }
}

/* ---------- Admin ---------- */

export async function forwardSupportTask(supportTaskId, { text, dueDate, dueTime, urgency, managerIds, clientName }) {
  const { db, user, error } = await requireRole(['admin']);
  if (error) return { error };
  const id = parseInt(supportTaskId, 10);
  const problem = checkTaskFields({ text, dueDate, dueTime });
  if (problem) return { error: problem };
  const wanted = idList(managerIds);
  if (wanted.length === 0) return { error: 'Select at least one manager' };
  try {
    const managers = (await getActiveUsersByRole(db, SUPPORT_MANAGER_ROLES)).filter((m) => wanted.includes(m.id));
    if (managers.length === 0) return { error: 'None of the selected managers are valid' };
    const source = await db.prepare('SELECT created_by, client_name FROM support_tasks WHERE id = ?').get(id || 0);
    if (!source) return { error: 'Task not found' };
    const picked = await resolveClient(db, clientName, source.client_name);
    if (picked.error) return { error: picked.error };
    const managerText = withClient(picked.client, clean(text));

    // One transaction: claim the pending support task (so it can't be forwarded twice) and create
    // the manager task with its assignees.
    const forward = db.transaction(async (tx) => {
      const claimed = await tx.prepare(`
        UPDATE support_tasks SET status = 'forwarded', client_name = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'
      `).run(picked.client, user.id, id);
      if (!claimed.changes) return false;
      const task = await tx.prepare('INSERT INTO manager_tasks (task_text, due_date, due_time, created_by, urgency) VALUES (?, ?, ?, ?, ?)')
        .run(managerText, clean(dueDate), clean(dueTime), user.id, parseUrgency(urgency));
      for (const m of managers) {
        await tx.prepare('INSERT INTO manager_task_assignees (task_id, user_id) VALUES (?, ?)').run(task.lastInsertRowid, m.id);
      }
      await tx.prepare('UPDATE support_tasks SET manager_task_id = ? WHERE id = ?').run(task.lastInsertRowid, id);
      return true;
    });
    if (!(await forward())) return { error: 'This task was already handled — refresh the page' };

    for (const m of managers) {
      await createNotificationsForUsers(db, [m.id], {
        title: 'New Task from Support',
        message: `${about(picked.client)}${clean(text).slice(0, 140)} — due ${clean(dueDate)} ${clean(dueTime)}`,
        link: getTasksLinkForRole(m.role),
      });
    }
    await createNotificationsForUsers(db, [source.created_by], {
      title: 'Your task was sent to the managers',
      message: `${managers.map((m) => m.name).join(', ')}: ${about(picked.client)}${clean(text).slice(0, 120)}`,
      link: '/support/tasks',
    });
    refresh();
    return { success: true };
  } catch (err) {
    return fail('forwardSupportTask', err);
  }
}

export async function rejectSupportTask(supportTaskId, note) {
  const { db, user, error } = await requireRole(['admin']);
  if (error) return { error };
  const id = parseInt(supportTaskId, 10);
  const reason = clean(note).slice(0, 1000);
  if (!reason) return { error: 'Give a reason' };
  try {
    const result = await db.prepare(`
      UPDATE support_tasks SET status = 'rejected', admin_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'pending'
    `).run(reason, user.id, id || 0);
    if (!result.changes) return { error: 'This task was already handled — refresh the page' };
    const task = await db.prepare('SELECT created_by FROM support_tasks WHERE id = ?').get(id);
    await createNotificationsForUsers(db, [task.created_by], { title: 'Your task was rejected', message: reason.slice(0, 160), link: '/support/tasks' });
    refresh();
    return { success: true };
  } catch (err) {
    return fail('rejectSupportTask', err);
  }
}

export async function approveSupportQuery(queryId, supportIds, clientName) {
  const { db, user, error } = await requireRole(['admin']);
  if (error) return { error };
  const id = parseInt(queryId, 10);
  const wanted = idList(supportIds);
  if (wanted.length === 0) return { error: 'Select at least one support person' };
  try {
    const people = (await getActiveUsersByRole(db, ['support'])).filter((p) => wanted.includes(p.id));
    if (people.length === 0) return { error: 'None of the selected support people are valid' };
    const source = await db.prepare('SELECT client_name FROM support_queries WHERE id = ?').get(id || 0);
    if (!source) return { error: 'Query not found' };
    const picked = await resolveClient(db, clientName, source.client_name);
    if (picked.error) return { error: picked.error };

    const approve = db.transaction(async (tx) => {
      const claimed = await tx.prepare(`
        UPDATE support_queries SET status = 'approved', client_name = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'
      `).run(picked.client, user.id, id || 0);
      if (!claimed.changes) return false;
      for (const p of people) {
        await tx.prepare('INSERT OR IGNORE INTO support_query_recipients (query_id, user_id) VALUES (?, ?)').run(id, p.id);
      }
      return true;
    });
    if (!(await approve())) return { error: 'This query was already handled — refresh the page' };

    const query = await db.prepare(`
      SELECT q.query_text, q.created_by, u.name, u.role FROM support_queries q LEFT JOIN users u ON u.id = q.created_by WHERE q.id = ?
    `).get(id);
    await createNotificationsForUsers(db, people.map((p) => p.id), {
      title: 'New query', message: `${query.name || 'A manager'}: ${about(picked.client)}${query.query_text.slice(0, 140)}`, link: '/support',
    });
    await createNotificationsForUsers(db, [query.created_by], {
      title: 'Your query was sent to Support',
      message: `${people.map((p) => p.name).join(', ')}: ${query.query_text.slice(0, 120)}`,
      link: supportLinkForRole(query.role),
    });
    refresh();
    return { success: true };
  } catch (err) {
    return fail('approveSupportQuery', err);
  }
}

export async function rejectSupportQuery(queryId, note) {
  const { db, user, error } = await requireRole(['admin']);
  if (error) return { error };
  const id = parseInt(queryId, 10);
  const reason = clean(note).slice(0, 1000);
  if (!reason) return { error: 'Give a reason' };
  try {
    const result = await db.prepare(`
      UPDATE support_queries SET status = 'rejected', admin_note = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'pending'
    `).run(reason, user.id, id || 0);
    if (!result.changes) return { error: 'This query was already handled — refresh the page' };
    const query = await db.prepare('SELECT q.created_by, u.role FROM support_queries q LEFT JOIN users u ON u.id = q.created_by WHERE q.id = ?').get(id);
    await createNotificationsForUsers(db, [query.created_by], {
      title: 'Your query was rejected', message: reason.slice(0, 160), link: supportLinkForRole(query.role),
    });
    refresh();
    return { success: true };
  } catch (err) {
    return fail('rejectSupportQuery', err);
  }
}

/* ---------- Nav badge ---------- */

// Admin: items waiting for a decision. Support: queries sent to them that nobody has answered yet.
// Manager: replies they have not seen.
export async function getSupportBadgeCount() {
  const session = await verifySession();
  if (!session) return 0;
  try {
    const db = await getDb();
    let row = null;
    if (session.role === 'admin') {
      row = await db.prepare(`
        SELECT (SELECT COUNT(*) FROM support_tasks WHERE status = 'pending')
          + (SELECT COUNT(*) FROM support_queries WHERE status = 'pending') AS c
      `).get();
    } else if (session.role === 'support') {
      row = await db.prepare(`
        SELECT COUNT(*) AS c FROM support_query_recipients r JOIN support_queries q ON q.id = r.query_id
        WHERE r.user_id = ? AND q.status = 'approved'
          AND NOT EXISTS (SELECT 1 FROM support_query_replies p WHERE p.query_id = q.id)
      `).get(session.userId);
    } else if (SUPPORT_MANAGER_ROLES.includes(session.role)) {
      row = await db.prepare(`
        SELECT COUNT(*) AS c FROM support_query_replies p JOIN support_queries q ON q.id = p.query_id
        WHERE q.created_by = ? AND p.seen_at IS NULL
      `).get(session.userId);
    }
    return row?.c || 0;
  } catch (err) {
    console.error('[Support] getSupportBadgeCount failed:', err);
    return 0;
  }
}
