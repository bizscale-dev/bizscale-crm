'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { ensureRecurringAssociateTasks } from '@/lib/recurringAssociateTasks';

const ASSOCIATE_ROLE = 'seo_associate';
const BASE_PATH = '/seo-manager/associate-tasks';

async function requireSeoManager() {
  const session = await verifySession();
  if (!session || session.role !== 'seo_manager') {
    return { error: 'Not authorized' };
  }
  return { session };
}

/**
 * Creates one task and assigns it to every selected SEO Associate — one
 * associate_tasks row plus one associate_task_assignees row per assignee.
 * Assignee ids are re-validated server-side against users (must actually be
 * an active seo_associate), never trusting the client's list blindly — same
 * convention as createManagerTask in admin/manager-tasks/actions.js.
 */
export async function createAssociateTask(formData) {
  const { session, error: authError } = await requireSeoManager();
  if (authError) return { error: authError };

  const taskText = (formData.get('task_text') || '').toString().trim();
  const dueDate = (formData.get('due_date') || '').toString().trim();
  const dueTime = (formData.get('due_time') || '').toString().trim();
  const assigneeIds = formData.getAll('assignee_ids')
    .map((v) => parseInt(v, 10))
    .filter((n) => !Number.isNaN(n));

  if (!taskText) return { error: 'Task description is required' };
  if (!dueDate) return { error: 'Due date is required' };
  if (!dueTime) return { error: 'Due time is required' };
  if (assigneeIds.length === 0) return { error: 'Select at least one associate to assign this task to' };

  try {
    const db = await getDb();
    const placeholders = assigneeIds.map(() => '?').join(',');
    const valid = await db.prepare(`
      SELECT id FROM users WHERE id IN (${placeholders}) AND role = ? AND is_active = 1
    `).all(...assigneeIds, ASSOCIATE_ROLE);
    if (valid.length === 0) return { error: 'None of the selected associates are valid' };

    const create = db.transaction(async (tx) => {
      const result = await tx.prepare(`
        INSERT INTO associate_tasks (task_text, due_date, due_time, created_by)
        VALUES (?, ?, ?, ?)
      `).run(taskText, dueDate, dueTime, session.userId);
      for (const u of valid) {
        await tx.prepare(`
          INSERT INTO associate_task_assignees (task_id, user_id) VALUES (?, ?)
        `).run(result.lastInsertRowid, u.id);
      }
    });
    await create();

    revalidatePath(BASE_PATH);
    return { success: true, assignedCount: valid.length };
  } catch (err) {
    console.error('[AssociateTasks] createAssociateTask failed:', err);
    return { error: err.message || 'Failed to create task — please try again.' };
  }
}

/**
 * Creates a recurring ("default") task: repeats every week starting on the
 * chosen start day, spanning duration_days days — due at 12 AM on the last
 * of those days. Same shape as createRecurringTemplate in
 * admin/manager-tasks/actions.js, one tier down.
 */
export async function createRecurringAssociateTemplate(formData) {
  const { session, error: authError } = await requireSeoManager();
  if (authError) return { error: authError };

  const taskText = (formData.get('task_text') || '').toString().trim();
  const dueTime = '23:59';
  const startWeekday = parseInt(formData.get('start_weekday'), 10);
  const durationDays = parseInt(formData.get('duration_days'), 10) || 1;
  const assigneeIds = formData.getAll('assignee_ids')
    .map((v) => parseInt(v, 10))
    .filter((n) => !Number.isNaN(n));

  if (!taskText) return { error: 'Task description is required' };
  if (!Number.isInteger(startWeekday) || startWeekday < 0 || startWeekday > 6) {
    return { error: 'Pick the day of the week this task starts on' };
  }
  if (durationDays < 1 || durationDays > 7) return { error: 'Duration must be between 1 and 7 days' };
  if (assigneeIds.length === 0) return { error: 'Select at least one associate to assign this task to' };

  try {
    const db = await getDb();
    const placeholders = assigneeIds.map(() => '?').join(',');
    const valid = await db.prepare(`
      SELECT id FROM users WHERE id IN (${placeholders}) AND role = ? AND is_active = 1
    `).all(...assigneeIds, ASSOCIATE_ROLE);
    if (valid.length === 0) return { error: 'None of the selected associates are valid' };

    const create = db.transaction(async (tx) => {
      const result = await tx.prepare(`
        INSERT INTO associate_task_templates (task_text, weekdays, duration_days, due_time, created_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(taskText, String(startWeekday), durationDays, dueTime, session.userId);
      for (const u of valid) {
        await tx.prepare(`
          INSERT INTO associate_task_template_assignees (template_id, user_id) VALUES (?, ?)
        `).run(result.lastInsertRowid, u.id);
      }
    });
    await create();

    await ensureRecurringAssociateTasks();

    revalidatePath(BASE_PATH);
    return { success: true, assignedCount: valid.length };
  } catch (err) {
    console.error('[AssociateTasks] createRecurringAssociateTemplate failed:', err);
    return { error: err.message || 'Failed to create recurring task — please try again.' };
  }
}

export async function setRecurringAssociateTemplateActive(templateId, active) {
  const { error: authError } = await requireSeoManager();
  if (authError) return { error: authError };
  const id = parseInt(templateId, 10);
  if (!id) return { error: 'Invalid template' };

  const db = await getDb();
  // Confirm this template actually belongs to our own associate role before
  // touching it — defense in depth against a forged id from another portal.
  const owns = await db.prepare(`
    SELECT 1 FROM associate_task_templates t
    JOIN associate_task_template_assignees ta ON ta.template_id = t.id
    JOIN users u ON u.id = ta.user_id
    WHERE t.id = ? AND u.role = ? LIMIT 1
  `).get(id, ASSOCIATE_ROLE);
  if (!owns) return { error: 'Template not found' };

  await db.prepare('UPDATE associate_task_templates SET is_active = ? WHERE id = ?').run(active ? 1 : 0, id);
  revalidatePath(BASE_PATH);
  return { success: true };
}

// Deleting a template stops future occurrences only — already-spawned
// occurrences (and their submissions) are ordinary tasks and are kept.
export async function deleteRecurringAssociateTemplate(templateId) {
  const { error: authError } = await requireSeoManager();
  if (authError) return { error: authError };
  const id = parseInt(templateId, 10);
  if (!id) return { error: 'Invalid template' };

  const db = await getDb();
  const owns = await db.prepare(`
    SELECT 1 FROM associate_task_templates t
    JOIN associate_task_template_assignees ta ON ta.template_id = t.id
    JOIN users u ON u.id = ta.user_id
    WHERE t.id = ? AND u.role = ? LIMIT 1
  `).get(id, ASSOCIATE_ROLE);
  if (!owns) return { error: 'Template not found' };

  await db.prepare('UPDATE associate_tasks SET template_id = NULL WHERE template_id = ?').run(id);
  await db.prepare('DELETE FROM associate_task_templates WHERE id = ?').run(id);
  revalidatePath(BASE_PATH);
  return { success: true };
}

/**
 * Approves or rejects one late submission. Only ever acts on an assignee row
 * that's actually is_late=1, approval_status='pending', AND belongs to our
 * own associate role (joined check) — prevents a manager from one portal
 * reviewing another role's associate submission via a forged id.
 *
 * review_seen is reset to 0 here — the moment the associate has something
 * new to find out about, bringing their nav dot back (see
 * getUnsubmittedAssociateTaskCount). Flips back to 1 when they next open
 * their Manager Tasks page.
 */
async function reviewTaskSubmission(assigneeId, decision) {
  const { session, error: authError } = await requireSeoManager();
  if (authError) return { error: authError };

  const id = parseInt(assigneeId, 10);
  if (!id || Number.isNaN(id)) return { error: 'Invalid submission' };

  try {
    const db = await getDb();
    const result = await db.prepare(`
      UPDATE associate_task_assignees
      SET approval_status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_seen = 0
      WHERE id = ? AND is_late = 1 AND approval_status = 'pending'
        AND user_id IN (SELECT id FROM users WHERE role = ?)
    `).run(decision, session.userId, id, ASSOCIATE_ROLE);

    if (!result.changes) return { error: 'This submission is no longer pending review' };

    revalidatePath(BASE_PATH);
    return { success: true };
  } catch (err) {
    console.error('[AssociateTasks] reviewTaskSubmission failed:', err);
    return { error: err.message || 'Failed to review — please try again.' };
  }
}

export async function approveAssociateTaskSubmission(assigneeId) {
  return reviewTaskSubmission(assigneeId, 'approved');
}

export async function rejectAssociateTaskSubmission(assigneeId) {
  return reviewTaskSubmission(assigneeId, 'rejected');
}
