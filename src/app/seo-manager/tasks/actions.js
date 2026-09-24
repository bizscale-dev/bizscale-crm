'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { ensureRecurringManagerTasks } from '@/lib/recurringManagerTasks';

// ~2MB of raw image bytes, inflated by base64's ~1.37x overhead — matches the
// client-side cap in TasksClient.jsx. Re-validated here since client-side
// validation alone isn't trustworthy (a modified request could bypass it).
const MAX_BASE64_LENGTH = 2 * 1024 * 1024 * 1.37;

async function requireSeoManager() {
  const session = await verifySession();
  if (!session || session.role !== 'seo_manager') {
    return { error: 'Not authorized' };
  }
  return { session };
}

/**
 * Count of things this manager needs to look at — feeds the Tasks nav item's
 * notification dot (see SeoManagerLayoutClient.jsx). Two cases:
 *   1. An assigned task still awaiting their own submission (no due-date
 *      gating — an overdue, still-unsubmitted task keeps showing the dot,
 *      not silently stops once its deadline passes).
 *   2. A late submission the admin has just approved/rejected that they
 *      haven't opened their Tasks page to see yet (review_seen = 0 — see
 *      reviewTaskSubmission in admin/manager-tasks/actions.js). The dot
 *      disappears again once they actually view it there.
 */
export async function getUnsubmittedTaskCount() {
  const { session, error } = await requireSeoManager();
  if (error) return 0;

  await ensureRecurringManagerTasks();

  const db = await getDb();
  const row = await db.prepare(`
    SELECT COUNT(*) as c FROM manager_task_assignees
    WHERE user_id = ? AND (submitted_at IS NULL OR review_seen = 0)
  `).get(session.userId);
  return row?.c || 0;
}

/**
 * Submits this manager's own proof for one assigned task. Re-derives the
 * signed-in user from the session rather than trusting a client-supplied user
 * id, and confirms the (task_id, user_id) assignee row actually belongs to them
 * before writing — a manager can only submit their own assignment, never
 * another manager's.
 *
 * Late-submission approval: if submitted after the task's due_date/due_time,
 * a reason is mandatory and the submission goes to 'pending' admin review
 * instead of counting as done outright — see approveTaskSubmission/
 * rejectTaskSubmission in src/app/admin/manager-tasks/actions.js. Lateness is
 * decided once, here, at submit time (not re-derived later), so it stays
 * accurate even if the task's due date is edited afterward.
 */
export async function submitTaskProof(taskId, description, proofImageBase64, lateReason) {
  const { session, error: authError } = await requireSeoManager();
  if (authError) return { error: authError };

  const id = parseInt(taskId, 10);
  if (!id || Number.isNaN(id)) {
    return { error: 'Invalid task' };
  }

  const cleanedDescription = (description || '').trim();
  if (!cleanedDescription) {
    return { error: 'Description is required' };
  }
  // Proof image is optional — only validated (format, size cap) when one was
  // actually provided; a missing image is no longer a rejection.
  const hasImage = !!proofImageBase64;
  if (hasImage) {
    if (typeof proofImageBase64 !== 'string' || !proofImageBase64.startsWith('data:image/')) {
      return { error: 'Proof image looks invalid — try re-attaching it' };
    }
    if (proofImageBase64.length > MAX_BASE64_LENGTH) {
      return { error: 'Proof image is too large (max 2MB)' };
    }
  }

  try {
    const db = await getDb();

    const assignee = await db.prepare(`
      SELECT a.id, t.due_date, t.due_time FROM manager_task_assignees a
      JOIN manager_tasks t ON t.id = a.task_id
      WHERE a.task_id = ? AND a.user_id = ?
    `).get(id, session.userId);
    if (!assignee) {
      return { error: 'This task is not assigned to you' };
    }

    const dueAt = new Date(`${assignee.due_date}T${assignee.due_time}:00`);
    const isLate = Number.isNaN(dueAt.getTime()) ? false : new Date() > dueAt;

    const cleanedLateReason = (lateReason || '').trim();
    if (isLate && !cleanedLateReason) {
      return { error: 'This task is overdue — please give a reason before submitting' };
    }

    await db.prepare(`
      UPDATE manager_task_assignees
      SET submission_description = ?, proof_image_base64 = ?, submitted_at = CURRENT_TIMESTAMP,
        is_late = ?, late_reason = ?, approval_status = ?
      WHERE task_id = ? AND user_id = ?
    `).run(
      cleanedDescription, hasImage ? proofImageBase64 : null, isLate ? 1 : 0,
      isLate ? cleanedLateReason : null, isLate ? 'pending' : null,
      id, session.userId
    );

    revalidatePath('/seo-manager/tasks');

    return { success: true, isLate };
  } catch (err) {
    console.error('[ManagerTasks] submitTaskProof failed:', err);
    return { error: err.message || 'Failed to submit — please try again.' };
  }
}
