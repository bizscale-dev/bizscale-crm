'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { ensureRecurringAssociateTasks } from '@/lib/recurringAssociateTasks';
import { applyClientCheck } from '@/lib/clientCheckTask';
import { validateImages } from '@/lib/multiImages';

// A Web Developer - SEO receives tasks from the Web SEO managers exactly like a Web SEO
// associate does, so both roles share these actions.
const ALLOWED_ROLES = ['web_seo_associate', 'web_developer_seo', 'graphic_designer'];

async function requireWebSeoAssociate() {
  const session = await verifySession();
  if (!session || !ALLOWED_ROLES.includes(session.role)) {
    return { error: 'Not authorized' };
  }
  return { session };
}

/**
 * Count of things this associate needs to look at — feeds the Manager Tasks
 * nav item's notification dot. Mirrors getUnsubmittedTaskCount in
 * seo-manager/tasks/actions.js, one tier down:
 *   1. An assigned task still awaiting their own submission.
 *   2. A late submission their manager has just approved/rejected that they
 *      haven't opened their Manager Tasks page to see yet (review_seen = 0).
 */
export async function getUnsubmittedAssociateTaskCount() {
  const { session, error } = await requireWebSeoAssociate();
  if (error) return 0;

  await ensureRecurringAssociateTasks();

  const db = await getDb();
  const row = await db.prepare(`
    SELECT COUNT(*) as c FROM associate_task_assignees
    WHERE user_id = ? AND (submitted_at IS NULL OR review_seen = 0)
  `).get(session.userId);
  return row?.c || 0;
}

/**
 * Submits this associate's own proof for one assigned task. Re-derives the
 * signed-in user from the session rather than trusting a client-supplied id,
 * and confirms the (task_id, user_id) assignee row actually belongs to them
 * before writing. Mirrors submitTaskProof in seo-manager/tasks/actions.js.
 */
export async function submitAssociateTaskProof(taskId, description, proofImageBase64, lateReason) {
  const { session, error: authError } = await requireWebSeoAssociate();
  if (authError) return { error: authError };

  const id = parseInt(taskId, 10);
  if (!id || Number.isNaN(id)) {
    return { error: 'Invalid task' };
  }

  const cleanedDescription = (description || '').trim();
  if (!cleanedDescription) {
    return { error: 'Description is required' };
  }
  // proofImageBase64 is one picture or a list of them (up to 6). The first goes in proof_image_base64 (what
  // every viewer already reads), the rest in extra_proof_images.
  const checked = validateImages(proofImageBase64);
  if (checked.error) return { error: checked.error };
  const [firstImage = null, ...otherImages] = checked.images;

  try {
    const db = await getDb();

    const assignee = await db.prepare(`
      SELECT a.id, t.due_date, t.due_time FROM associate_task_assignees a
      JOIN associate_tasks t ON t.id = a.task_id
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
      UPDATE associate_task_assignees
      SET submission_description = ?, proof_image_base64 = ?, submitted_at = CURRENT_TIMESTAMP,
        is_late = ?, late_reason = ?, approval_status = ?, extra_proof_images = ?
      WHERE task_id = ? AND user_id = ?
    `).run(
      cleanedDescription, firstImage, isLate ? 1 : 0,
      isLate ? cleanedLateReason : null, isLate ? 'pending' : null,
      otherImages.length ? JSON.stringify(otherImages) : null,
      id, session.userId
    );

    revalidatePath('/web-associate/manager-tasks');
    revalidatePath('/web-developer/tasks');

    return { success: true, isLate };
  } catch (err) {
    console.error('[AssociateTasks] submitAssociateTaskProof failed:', err);
    return { error: err.message || 'Failed to submit — please try again.' };
  }
}

/** Ticks or unticks one client of a "check every client" task (the ranking checks) for the signed-in Web SEO associate. */
export async function setClientCheck(taskId, index, checked) {
  const { session, error: authError } = await requireWebSeoAssociate();
  if (authError) return { error: authError };
  try {
    const db = await getDb();
    const result = await applyClientCheck(db, session.userId, taskId, index, checked);
    if (result.success) revalidatePath('/web-associate/manager-tasks');
    return result;
  } catch (err) {
    console.error('[WebAssociateTasks] setClientCheck failed:', err);
    return { error: 'Could not save — please try again.' };
  }
}
