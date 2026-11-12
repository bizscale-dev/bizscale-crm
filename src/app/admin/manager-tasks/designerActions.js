'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { createNotificationsForUsers } from '@/lib/notifications';
import { parseUrgency } from '@/lib/taskUrgency';
import { readAttachment } from '@/lib/taskAttachment';
import { pakistanDate } from '@/lib/qaAssociateWork';

const DESIGNER_ROLE = 'graphic_designer';
const EXEC_ROLE = 'graphic_designer_executive';
// Designers get the task as an associate task, the Executive as a manager task (their own My Tasks page).
const LINKS = { [DESIGNER_ROLE]: '/graphic-designer/tasks', [EXEC_ROLE]: '/graphic-executive/my-tasks' };
const MAX_DATES = 60;

async function requireAdmin() {
  const session = await verifySession();
  return session && session.role === 'admin' ? session : null;
}

const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const isTime = (s) => /^\d{1,2}:\d{2}$/.test(String(s || ''));

function shiftDate(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateLabel(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

async function validPeople(db, ids) {
  if (ids.length === 0) return [];
  return db.prepare(`
    SELECT id, role FROM users WHERE id IN (${ids.map(() => '?').join(',')}) AND role IN (?, ?) AND is_active = 1
  `).all(...ids, DESIGNER_ROLE, EXEC_ROLE);
}

// Writes one task for the selected people: the designers as an associate task, the Executive as a manager task.
async function insertTask(tx, people, { text, due, time, createdBy, urgency, attachment }) {
  const designers = people.filter((p) => p.role === DESIGNER_ROLE);
  const execs = people.filter((p) => p.role === EXEC_ROLE);
  if (designers.length > 0) {
    const r = await tx.prepare('INSERT INTO associate_tasks (task_text, due_date, due_time, created_by, urgency, attachment_base64) VALUES (?, ?, ?, ?, ?, ?)')
      .run(text, due, time, createdBy, urgency, attachment || null);
    for (const u of designers) await tx.prepare('INSERT INTO associate_task_assignees (task_id, user_id) VALUES (?, ?)').run(r.lastInsertRowid, u.id);
  }
  if (execs.length > 0) {
    const r = await tx.prepare('INSERT INTO manager_tasks (task_text, due_date, due_time, created_by, urgency) VALUES (?, ?, ?, ?, ?)')
      .run(text, due, time, createdBy, urgency);
    for (const u of execs) await tx.prepare('INSERT INTO manager_task_assignees (task_id, user_id) VALUES (?, ?)').run(r.lastInsertRowid, u.id);
  }
}

async function notifyPeople(db, people, payload) {
  for (const role of [DESIGNER_ROLE, EXEC_ROLE]) {
    const ids = people.filter((p) => p.role === role).map((u) => u.id);
    if (ids.length > 0) await createNotificationsForUsers(db, ids, { ...payload, link: LINKS[role] });
  }
}

/** Admin assigns one ordinary task to Graphics Designers and / or the Graphic Designer Executive (the picture goes to the designers). */
export async function createDesignerTask(formData) {
  const session = await requireAdmin();
  if (!session) return { error: 'Not authorized' };

  const taskText = (formData.get('task_text') || '').toString().trim();
  const dueDate = (formData.get('due_date') || '').toString().trim();
  const dueTime = (formData.get('due_time') || '').toString().trim();
  const urgency = parseUrgency(formData.get('urgency'));
  const attachment = readAttachment(formData);
  const ids = [...new Set(formData.getAll('assignee_ids').map((v) => parseInt(v, 10)).filter((n) => !Number.isNaN(n)))];

  if (!taskText) return { error: 'Task description is required' };
  if (!isIsoDate(dueDate)) return { error: 'Due date is required' };
  if (!isTime(dueTime)) return { error: 'Due time is required' };
  if (attachment.error) return { error: attachment.error };
  if (ids.length === 0) return { error: 'Select at least one person' };

  try {
    const db = await getDb();
    const valid = await validPeople(db, ids);
    if (valid.length === 0) return { error: 'None of the selected people are valid' };

    const create = db.transaction(async (tx) => {
      await insertTask(tx, valid, { text: taskText, due: dueDate, time: dueTime, createdBy: session.userId, urgency, attachment: attachment.value });
    });
    await create();

    await notifyPeople(db, valid, { title: 'New Task from Admin', message: `${taskText.slice(0, 140)} — due ${dueDate} ${dueTime}` });
    revalidatePath('/admin/manager-tasks');
    return { success: true, assignedCount: valid.length, taskCount: 1 };
  } catch (err) {
    console.error('[Admin] createDesignerTask failed:', err);
    return { error: err.message || 'Failed to create task — please try again.' };
  }
}

/**
 * Bulk default task for the Graphics Designers and / or their Executive: ONE task text and several dates (for example the days posts go
 * live). Every date becomes its own task, due `leadDays` days BEFORE that date (default 2), so the design is
 * ready ahead of time. All selected designers get every task.
 */
export async function createDesignerBulkTasks({ taskText, dates, leadDays, dueTime, urgency, assigneeIds }) {
  const session = await requireAdmin();
  if (!session) return { error: 'Not authorized' };

  const text = typeof taskText === 'string' ? taskText.trim() : '';
  const list = [...new Set((Array.isArray(dates) ? dates : []).filter(isIsoDate))].sort();
  const lead = Math.min(30, Math.max(0, parseInt(leadDays, 10) || 0));
  const time = isTime(dueTime) ? dueTime : '23:59';
  const ids = [...new Set((Array.isArray(assigneeIds) ? assigneeIds : []).map((v) => parseInt(v, 10)).filter((n) => !Number.isNaN(n)))];

  if (!text) return { error: 'Task description is required' };
  if (text.length > 4000) return { error: 'Task description is too long (max 4000 characters)' };
  if (list.length === 0) return { error: 'Add at least one date' };
  if (list.length > MAX_DATES) return { error: `Too many dates (max ${MAX_DATES} at once)` };
  if (ids.length === 0) return { error: 'Select at least one person' };

  const today = pakistanDate(0);
  const plan = list.map((date) => ({ date, due: shiftDate(date, -lead) }));
  const past = plan.filter((p) => p.due < today);
  if (past.length > 0) {
    return { error: `${past.map((p) => `${dateLabel(p.date)} (would be due ${dateLabel(p.due)})`).join(', ')} — already past the due date. Remove ${past.length === 1 ? 'that date' : 'those dates'} or lower the number of days.` };
  }

  try {
    const db = await getDb();
    const valid = await validPeople(db, ids);
    if (valid.length === 0) return { error: 'None of the selected people are valid' };
    const urg = parseUrgency(urgency);

    const create = db.transaction(async (tx) => {
      for (const p of plan) {
        await insertTask(tx, valid, { text: `${text} — for ${dateLabel(p.date)}`, due: p.due, time, createdBy: session.userId, urgency: urg });
      }
    });
    await create();

    await notifyPeople(db, valid, { title: 'New Tasks from Admin', message: `${plan.length} task${plan.length === 1 ? '' : 's'}: ${text.slice(0, 100)} — first due ${plan[0].due} ${time}` });
    revalidatePath('/admin/manager-tasks');
    return { success: true, assignedCount: valid.length, taskCount: plan.length };
  } catch (err) {
    console.error('[Admin] createDesignerBulkTasks failed:', err);
    return { error: err.message || 'Failed to create tasks — please try again.' };
  }
}
