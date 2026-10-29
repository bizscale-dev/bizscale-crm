'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { ensureRecurringManagerTasks } from '@/lib/recurringManagerTasks';
import { createNotificationsForUsers, getTasksLinkForRole } from '@/lib/notifications';
import { parseUrgency } from '@/lib/taskUrgency';
import { ONBOARDING_KEYS, validateSections, createOnboardingTasks } from '@/lib/onboardingChecklists';

const MANAGER_ROLES = ['seo_manager', 'web_seo_manager', 'writers_manager'];

async function requireAdmin() {
  const session = await verifySession();
  if (!session || session.role !== 'admin') {
    return { error: 'Not authorized' };
  }
  return { session };
}

/**
 * Creates one task and assigns it to every selected manager in a single
 * transaction — one manager_tasks row plus one manager_task_assignees row per
 * assignee. Assignee ids are re-validated server-side against the users table
 * (must actually be an active user with one of the 3 manager roles) rather than
 * trusting whatever ids the client submitted, matching this app's existing
 * "never trust client-supplied ids for permanent records" convention.
 */
export async function createManagerTask(formData) {
  const { error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const taskText = (formData.get('task_text') || '').toString().trim();
  const dueDate = (formData.get('due_date') || '').toString().trim();
  const dueTime = (formData.get('due_time') || '').toString().trim();
  const urgency = parseUrgency(formData.get('urgency'));
  const assigneeIds = formData.getAll('assignee_ids')
    .map((v) => parseInt(v, 10))
    .filter((n) => !Number.isNaN(n));

  if (!taskText) {
    return { error: 'Task description is required' };
  }
  if (!dueDate) {
    return { error: 'Due date is required' };
  }
  if (!dueTime) {
    return { error: 'Due time is required' };
  }
  if (assigneeIds.length === 0) {
    return { error: 'Select at least one manager to assign this task to' };
  }

  try {
    const db = await getDb();
    const session = (await verifySession());

    const placeholders = assigneeIds.map(() => '?').join(',');
    const rolePlaceholders = MANAGER_ROLES.map(() => '?').join(',');
    const validManagers = await db.prepare(`
      SELECT id, role FROM users
      WHERE id IN (${placeholders}) AND role IN (${rolePlaceholders}) AND is_active = 1
    `).all(...assigneeIds, ...MANAGER_ROLES);

    if (validManagers.length === 0) {
      return { error: 'None of the selected managers are valid' };
    }
    const validIds = validManagers.map((m) => m.id);

    const createTask = db.transaction(async (tx, { taskText, dueDate, dueTime, urgency, createdBy, validIds }) => {
      const result = await tx.prepare(`
        INSERT INTO manager_tasks (task_text, due_date, due_time, created_by, urgency)
        VALUES (?, ?, ?, ?, ?)
      `).run(taskText, dueDate, dueTime, createdBy, urgency);

      const taskId = result.lastInsertRowid;
      for (const userId of validIds) {
        await tx.prepare(`
          INSERT INTO manager_task_assignees (task_id, user_id) VALUES (?, ?)
        `).run(taskId, userId);
      }
      return taskId;
    });

    await createTask({ taskText, dueDate, dueTime, urgency, createdBy: session.userId, validIds });

    // Notify each assignee — grouped by role since the link (and each
    // recipient's own Tasks page) differs per manager role.
    const byRole = new Map();
    for (const m of validManagers) {
      if (!byRole.has(m.role)) byRole.set(m.role, []);
      byRole.get(m.role).push(m.id);
    }
    const dueLabel = `${dueDate} ${dueTime}`;
    for (const [role, ids] of byRole.entries()) {
      await createNotificationsForUsers(db, ids, {
        title: 'New Task from Admin',
        message: `${taskText.slice(0, 140)} — due ${dueLabel}`,
        link: getTasksLinkForRole(role),
      });
    }

    revalidatePath('/admin/manager-tasks');

    return { success: true, assignedCount: validIds.length };
  } catch (err) {
    console.error('[ManagerTasks] createManagerTask failed:', err);
    return { error: err.message || 'Failed to create task — please try again.' };
  }
}

/**
 * Creates a recurring ("default") task: repeats every week starting on the
 * chosen start day, and each occurrence spans duration_days days — due at
 * due_time (default end of day) on the LAST of those days. duration_days=1
 * (the normal case) is due that same start day, same as before; a task that
 * takes e.g. 4 days (Fri/Sat/Sun/Mon) picks Friday as the start day and 4 as
 * the duration, and is due Monday at 12 AM. Occurrences are spawned by
 * ensureRecurringManagerTasks (src/lib/recurringManagerTasks.js).
 */
export async function createRecurringTemplate(formData) {
  const { session, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const taskText = (formData.get('task_text') || '').toString().trim();
  // Default tasks are always due at 12 AM (end of their day) — stored as 23:59 so
  // the same-day lateness check (due_date + due_time) stays valid.
  const dueTime = '23:59';
  const startWeekday = parseInt(formData.get('start_weekday'), 10);
  const durationDays = parseInt(formData.get('duration_days'), 10) || 1;
  const urgency = parseUrgency(formData.get('urgency'));
  const assigneeIds = formData.getAll('assignee_ids')
    .map((v) => parseInt(v, 10))
    .filter((n) => !Number.isNaN(n));

  if (!taskText) return { error: 'Task description is required' };
  if (!Number.isInteger(startWeekday) || startWeekday < 0 || startWeekday > 6) {
    return { error: 'Pick the day of the week this task starts on' };
  }
  if (durationDays < 1 || durationDays > 7) return { error: 'Duration must be between 1 and 7 days' };
  if (assigneeIds.length === 0) return { error: 'Select at least one manager to assign this task to' };

  try {
    const db = await getDb();
    const placeholders = assigneeIds.map(() => '?').join(',');
    const rolePlaceholders = MANAGER_ROLES.map(() => '?').join(',');
    const valid = await db.prepare(`
      SELECT id FROM users
      WHERE id IN (${placeholders}) AND role IN (${rolePlaceholders}) AND is_active = 1
    `).all(...assigneeIds, ...MANAGER_ROLES);
    if (valid.length === 0) return { error: 'None of the selected managers are valid' };

    const create = db.transaction(async (tx) => {
      const result = await tx.prepare(`
        INSERT INTO manager_task_templates (task_text, weekdays, duration_days, due_time, created_by, urgency)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(taskText, String(startWeekday), durationDays, dueTime, session.userId, urgency);
      for (const m of valid) {
        await tx.prepare(`
          INSERT INTO manager_task_template_assignees (template_id, user_id) VALUES (?, ?)
        `).run(result.lastInsertRowid, m.id);
      }
    });
    await create();

    // Spawn today's occurrence right away if today is one of the chosen days.
    await ensureRecurringManagerTasks();

    revalidatePath('/admin/manager-tasks');
    return { success: true, assignedCount: valid.length };
  } catch (err) {
    console.error('[ManagerTasks] createRecurringTemplate failed:', err);
    return { error: err.message || 'Failed to create recurring task — please try again.' };
  }
}

export async function setRecurringTemplateActive(templateId, active) {
  const { error: authError } = await requireAdmin();
  if (authError) return { error: authError };
  const id = parseInt(templateId, 10);
  if (!id) return { error: 'Invalid template' };
  const db = await getDb();
  await db.prepare('UPDATE manager_task_templates SET is_active = ? WHERE id = ?').run(active ? 1 : 0, id);
  revalidatePath('/admin/manager-tasks');
  return { success: true };
}

// Deleting a template stops future occurrences only — already-spawned
// occurrences (and their submissions) are ordinary tasks and are kept.
export async function deleteRecurringTemplate(templateId) {
  const { error: authError } = await requireAdmin();
  if (authError) return { error: authError };
  const id = parseInt(templateId, 10);
  if (!id) return { error: 'Invalid template' };
  const db = await getDb();
  await db.prepare('UPDATE manager_tasks SET template_id = NULL WHERE template_id = ?').run(id);
  await db.prepare('DELETE FROM manager_task_templates WHERE id = ?').run(id);
  revalidatePath('/admin/manager-tasks');
  return { success: true };
}

/**
 * Saves an edited onboarding checklist (sections, items, due working days).
 * Only affects tasks created from now on.
 */
export async function saveOnboardingChecklist(key, sections) {
  const { error: authError } = await requireAdmin();
  if (authError) return { error: authError };
  if (!ONBOARDING_KEYS.includes(key)) return { error: 'Unknown checklist' };
  const clean = validateSections(sections);
  if (clean.error) return { error: clean.error };

  try {
    const db = await getDb();
    await db.prepare(`
      INSERT INTO onboarding_checklists (key, sections, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET sections = excluded.sections, updated_at = CURRENT_TIMESTAMP
    `).run(key, JSON.stringify(clean.sections));
    revalidatePath('/admin/manager-tasks');
    return { success: true };
  } catch (err) {
    console.error('[ManagerTasks] saveOnboardingChecklist failed:', err);
    return { error: err.message || 'Failed to save the checklist — please try again.' };
  }
}

/**
 * Admin hands the Web onboarding task for one client to a Web SEO manager.
 * Creates one checklist task per section of the web checklist.
 */
export async function assignWebOnboarding(formData) {
  const { session, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const managerId = parseInt(formData.get('manager_id'), 10);
  const clientName = (formData.get('client_name') || '').toString().trim().slice(0, 150);
  const website = (formData.get('website') || '').toString().trim().slice(0, 200);
  if (!managerId) return { error: 'Pick a manager' };
  if (!clientName) return { error: 'Client name is required' };
  if (!website) return { error: 'Website is required' };

  try {
    const db = await getDb();
    const manager = await db.prepare(`
      SELECT id, role FROM users WHERE id = ? AND role = 'web_seo_manager' AND is_active = 1
    `).get(managerId);
    if (!manager) return { error: 'That manager is not valid' };

    const count = await createOnboardingTasks(db, {
      key: 'web', label: `${clientName} (${website})`, manager, adminId: session.userId,
    });
    revalidatePath('/admin/manager-tasks');
    return { success: true, taskCount: count };
  } catch (err) {
    console.error('[ManagerTasks] assignWebOnboarding failed:', err);
    return { error: err.message || 'Failed to assign — please try again.' };
  }
}

/**
 * Moves a task's deadline later — works on any task, default (recurring /
 * onboarding) or not, manager task or associate task. Only the deadline
 * changes; lateness of an already-made submission stays as it was decided at
 * submit time. People who haven't submitted yet are notified.
 */
export async function extendTaskDeadline(kind, taskId, newDate, newTime) {
  const { error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const tables = {
    manager: { task: 'manager_tasks', assignees: 'manager_task_assignees' },
    associate: { task: 'associate_tasks', assignees: 'associate_task_assignees' },
  };
  const t = tables[kind];
  const id = parseInt(taskId, 10);
  const date = String(newDate || '').trim();
  const time = String(newTime || '').trim();
  if (!t || !id) return { error: 'Invalid task' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Pick the new due date' };
  if (!/^\d{2}:\d{2}$/.test(time)) return { error: 'Pick the new due time' };

  try {
    const db = await getDb();
    const task = await db.prepare(`SELECT id, task_text, due_date, due_time FROM ${t.task} WHERE id = ?`).get(id);
    if (!task) return { error: 'Task not found' };
    if (`${date} ${time}` <= `${task.due_date} ${task.due_time}`) {
      return { error: 'The new deadline must be later than the current one' };
    }

    try {
      await db.prepare(`UPDATE ${t.task} SET due_date = ?, due_time = ? WHERE id = ?`).run(date, time, id);
    } catch (err) {
      if (/UNIQUE/i.test(err.message || '')) {
        return { error: 'Another occurrence of this default task already uses that date — pick a different day' };
      }
      throw err;
    }

    const waiting = await db.prepare(`
      SELECT a.user_id, u.role FROM ${t.assignees} a JOIN users u ON u.id = a.user_id
      WHERE a.task_id = ? AND a.submitted_at IS NULL AND u.is_active = 1
    `).all(id);
    const byRole = new Map();
    for (const a of waiting) {
      if (!byRole.has(a.role)) byRole.set(a.role, []);
      byRole.get(a.role).push(a.user_id);
    }
    for (const [role, ids] of byRole.entries()) {
      await createNotificationsForUsers(db, ids, {
        title: 'Task Deadline Extended',
        message: `${task.task_text.slice(0, 120)} — now due ${date} ${time}`,
        link: getTasksLinkForRole(role),
      });
    }

    revalidatePath('/admin/manager-tasks');
    return { success: true };
  } catch (err) {
    console.error('[ManagerTasks] extendTaskDeadline failed:', err);
    return { error: err.message || 'Failed to extend the deadline — please try again.' };
  }
}

/**
 * Approves or rejects one late submission. Only ever acts on an assignee row
 * that's actually is_late=1 and approval_status='pending' — an on-time
 * submission was never routed for review in the first place (approval_status
 * stays NULL), so there's nothing here for these to accidentally touch.
 *
 * review_seen is reset to 0 here — this is the moment the manager has
 * something new to find out about, so it brings their nav dot back (see
 * getUnsubmittedTaskCount in each portal's tasks/actions.js). It flips back
 * to 1 the next time they actually open their Tasks page.
 */
async function reviewTaskSubmission(assigneeId, decision) {
  const { session, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const id = parseInt(assigneeId, 10);
  if (!id || Number.isNaN(id)) {
    return { error: 'Invalid submission' };
  }

  try {
    const db = await getDb();

    const result = await db.prepare(`
      UPDATE manager_task_assignees
      SET approval_status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_seen = 0
      WHERE id = ? AND is_late = 1 AND approval_status = 'pending'
    `).run(decision, session.userId, id);

    if (!result.changes) {
      return { error: 'This submission is no longer pending review' };
    }

    revalidatePath('/admin/manager-tasks');

    return { success: true };
  } catch (err) {
    console.error('[ManagerTasks] reviewTaskSubmission failed:', err);
    return { error: err.message || 'Failed to review — please try again.' };
  }
}

export async function approveTaskSubmission(assigneeId) {
  return reviewTaskSubmission(assigneeId, 'approved');
}

export async function rejectTaskSubmission(assigneeId) {
  return reviewTaskSubmission(assigneeId, 'rejected');
}
