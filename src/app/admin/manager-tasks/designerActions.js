'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { createNotificationsForUsers } from '@/lib/notifications';
import { parseUrgency } from '@/lib/taskUrgency';
import { readAttachment } from '@/lib/taskAttachment';
import { pakistanDate } from '@/lib/qaAssociateWork';

const DESIGNER_ROLE = 'graphic_designer';
const DESIGNER_TASKS_LINK = '/graphic-designer/tasks';
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

async function validDesigners(db, ids) {
  if (ids.length === 0) return [];
  return db.prepare(`
    SELECT id FROM users WHERE id IN (${ids.map(() => '?').join(',')}) AND role = ? AND is_active = 1
  `).all(...ids, DESIGNER_ROLE);
}

/** Admin assigns one ordinary task to Graphics Designers (optional picture). */
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
  if (ids.length === 0) return { error: 'Select at least one designer' };

  try {
    const db = await getDb();
    const valid = await validDesigners(db, ids);
    if (valid.length === 0) return { error: 'None of the selected designers are valid' };

    const create = db.transaction(async (tx) => {
      const r = await tx.prepare('INSERT INTO associate_tasks (task_text, due_date, due_time, created_by, urgency, attachment_base64) VALUES (?, ?, ?, ?, ?, ?)')
        .run(taskText, dueDate, dueTime, session.userId, urgency, attachment.value);
      for (const u of valid) await tx.prepare('INSERT INTO associate_task_assignees (task_id, user_id) VALUES (?, ?)').run(r.lastInsertRowid, u.id);
    });
    await create();

    await createNotificationsForUsers(db, valid.map((u) => u.id), {
      title: 'New Task from Admin',
      message: `${taskText.slice(0, 140)} — due ${dueDate} ${dueTime}`,
      link: DESIGNER_TASKS_LINK,
    });
    revalidatePath('/admin/manager-tasks');
    return { success: true, assignedCount: valid.length, taskCount: 1 };
  } catch (err) {
    console.error('[Admin] createDesignerTask failed:', err);
    return { error: err.message || 'Failed to create task — please try again.' };
  }
}

/**
 * Bulk default task for Graphics Designers: ONE task text and several dates (for example the days posts go
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
  if (ids.length === 0) return { error: 'Select at least one designer' };

  const today = pakistanDate(0);
  const plan = list.map((date) => ({ date, due: shiftDate(date, -lead) }));
  const past = plan.filter((p) => p.due < today);
  if (past.length > 0) {
    return { error: `${past.map((p) => `${dateLabel(p.date)} (would be due ${dateLabel(p.due)})`).join(', ')} — already past the due date. Remove ${past.length === 1 ? 'that date' : 'those dates'} or lower the number of days.` };
  }

  try {
    const db = await getDb();
    const valid = await validDesigners(db, ids);
    if (valid.length === 0) return { error: 'None of the selected designers are valid' };
    const urg = parseUrgency(urgency);

    const create = db.transaction(async (tx) => {
      for (const p of plan) {
        const r = await tx.prepare('INSERT INTO associate_tasks (task_text, due_date, due_time, created_by, urgency) VALUES (?, ?, ?, ?, ?)')
          .run(`${text} — for ${dateLabel(p.date)}`, p.due, time, session.userId, urg);
        for (const u of valid) await tx.prepare('INSERT INTO associate_task_assignees (task_id, user_id) VALUES (?, ?)').run(r.lastInsertRowid, u.id);
      }
    });
    await create();

    await createNotificationsForUsers(db, valid.map((u) => u.id), {
      title: 'New Tasks from Admin',
      message: `${plan.length} task${plan.length === 1 ? '' : 's'}: ${text.slice(0, 100)} — first due ${plan[0].due} ${time}`,
      link: DESIGNER_TASKS_LINK,
    });
    revalidatePath('/admin/manager-tasks');
    return { success: true, assignedCount: valid.length, taskCount: plan.length };
  } catch (err) {
    console.error('[Admin] createDesignerBulkTasks failed:', err);
    return { error: err.message || 'Failed to create tasks — please try again.' };
  }
}
