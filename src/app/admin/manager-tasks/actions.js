'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';

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
      SELECT id FROM users
      WHERE id IN (${placeholders}) AND role IN (${rolePlaceholders}) AND is_active = 1
    `).all(...assigneeIds, ...MANAGER_ROLES);

    if (validManagers.length === 0) {
      return { error: 'None of the selected managers are valid' };
    }
    const validIds = validManagers.map((m) => m.id);

    const createTask = db.transaction(async (tx, { taskText, dueDate, dueTime, createdBy, validIds }) => {
      const result = await tx.prepare(`
        INSERT INTO manager_tasks (task_text, due_date, due_time, created_by)
        VALUES (?, ?, ?, ?)
      `).run(taskText, dueDate, dueTime, createdBy);

      const taskId = result.lastInsertRowid;
      for (const userId of validIds) {
        await tx.prepare(`
          INSERT INTO manager_task_assignees (task_id, user_id) VALUES (?, ?)
        `).run(taskId, userId);
      }
      return taskId;
    });

    await createTask({ taskText, dueDate, dueTime, createdBy: session.userId, validIds });

    revalidatePath('/admin/manager-tasks');

    return { success: true, assignedCount: validIds.length };
  } catch (err) {
    console.error('[ManagerTasks] createManagerTask failed:', err);
    return { error: err.message || 'Failed to create task — please try again.' };
  }
}

/**
 * Approves or rejects one late submission. Only ever acts on an assignee row
 * that's actually is_late=1 and approval_status='pending' — an on-time
 * submission was never routed for review in the first place (approval_status
 * stays NULL), so there's nothing here for these to accidentally touch.
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
      SET approval_status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
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
