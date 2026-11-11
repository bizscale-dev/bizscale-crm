'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { createNotificationsForUsers, getTasksLinkForRole } from '@/lib/notifications';
import { parseUrgency } from '@/lib/taskUrgency';
import { MANAGER_TIER_ROLES, ASSOCIATE_TIER_ROLES } from './roles';

async function requireQa() {
  const session = await verifySession();
  return session && session.role === 'qa' ? session : null;
}

/**
 * QA assigns one task to any mix of people. Managers (SEO / Web SEO / Writers) get it as an admin-style
 * manager task on their Tasks page; associates, Web Developers, Graphics Designers and Writers get it as
 * an associate task on their Manager Tasks page. Both tiers already have their own submit flow, so the
 * recipients submit as usual and QA sees the result in the list on this page. Assignee ids are
 * re-validated against users (active, one of the assignable roles) — the client's list is never trusted.
 */
export async function createQaTask(formData) {
  const session = await requireQa();
  if (!session) return { error: 'Not authorized' };

  const taskText = (formData.get('task_text') || '').toString().trim();
  const dueDate = (formData.get('due_date') || '').toString().trim();
  const dueTime = (formData.get('due_time') || '').toString().trim();
  const urgency = parseUrgency(formData.get('urgency'));
  const ids = [...new Set(formData.getAll('assignee_ids').map((v) => parseInt(v, 10)).filter((n) => !Number.isNaN(n)))];

  if (!taskText) return { error: 'Task description is required' };
  if (taskText.length > 5000) return { error: 'Task description is too long (max 5000 characters)' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { error: 'Due date is required' };
  if (!/^\d{1,2}:\d{2}$/.test(dueTime)) return { error: 'Due time is required' };
  if (ids.length === 0) return { error: 'Select at least one person to assign this task to' };

  try {
    const db = await getDb();
    const roles = [...MANAGER_TIER_ROLES, ...ASSOCIATE_TIER_ROLES];
    const people = await db.prepare(`
      SELECT id, role FROM users
      WHERE id IN (${ids.map(() => '?').join(',')}) AND role IN (${roles.map(() => '?').join(',')}) AND is_active = 1
    `).all(...ids, ...roles);
    if (people.length === 0) return { error: 'None of the selected people can be assigned tasks' };

    const managers = people.filter((p) => MANAGER_TIER_ROLES.includes(p.role));
    const associates = people.filter((p) => ASSOCIATE_TIER_ROLES.includes(p.role));

    const create = db.transaction(async (tx) => {
      if (managers.length > 0) {
        const r = await tx.prepare('INSERT INTO manager_tasks (task_text, due_date, due_time, created_by, urgency) VALUES (?, ?, ?, ?, ?)')
          .run(taskText, dueDate, dueTime, session.userId, urgency);
        for (const p of managers) await tx.prepare('INSERT INTO manager_task_assignees (task_id, user_id) VALUES (?, ?)').run(r.lastInsertRowid, p.id);
      }
      if (associates.length > 0) {
        const r = await tx.prepare('INSERT INTO associate_tasks (task_text, due_date, due_time, created_by, urgency) VALUES (?, ?, ?, ?, ?)')
          .run(taskText, dueDate, dueTime, session.userId, urgency);
        for (const p of associates) await tx.prepare('INSERT INTO associate_task_assignees (task_id, user_id) VALUES (?, ?)').run(r.lastInsertRowid, p.id);
      }
    });
    await create();

    // Notify each person, grouped by role because their Tasks page differs per role.
    const byRole = new Map();
    for (const p of people) {
      if (!byRole.has(p.role)) byRole.set(p.role, []);
      byRole.get(p.role).push(p.id);
    }
    for (const [role, userIds] of byRole) {
      await createNotificationsForUsers(db, userIds, {
        title: 'New Task from QA',
        message: `${taskText.slice(0, 140)} — due ${dueDate} ${dueTime}`,
        link: getTasksLinkForRole(role),
      });
    }

    revalidatePath('/qa/assign-tasks');
    return { success: true, assignedCount: people.length };
  } catch (err) {
    console.error('[QA] createQaTask failed:', err);
    return { error: err.message || 'Failed to create task — please try again.' };
  }
}
