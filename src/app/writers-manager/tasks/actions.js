'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';

// ~2MB of raw image bytes, inflated by base64's ~1.37x overhead — matches the
// client-side cap in TasksClient.jsx. Re-validated here since client-side
// validation alone isn't trustworthy (a modified request could bypass it).
const MAX_BASE64_LENGTH = 2 * 1024 * 1024 * 1.37;

async function requireWritersManager() {
  const session = await verifySession();
  if (!session || session.role !== 'writers_manager') {
    return { error: 'Not authorized' };
  }
  return { session };
}

/**
 * Count of this manager's assigned tasks still awaiting their own submission —
 * feeds the Tasks nav item's notification dot (see WritersManagerLayoutClient.jsx).
 * No due-date gating: an overdue, still-unsubmitted task should keep showing the
 * dot, not silently stop counting once its deadline passes.
 */
export async function getUnsubmittedTaskCount() {
  const { session, error } = await requireWritersManager();
  if (error) return 0;

  const db = await getDb();
  const row = await db.prepare(`
    SELECT COUNT(*) as c FROM manager_task_assignees
    WHERE user_id = ? AND submitted_at IS NULL
  `).get(session.userId);
  return row?.c || 0;
}

/**
 * Submits this manager's own proof for one assigned task. Re-derives the
 * signed-in user from the session rather than trusting a client-supplied user
 * id, and confirms the (task_id, user_id) assignee row actually belongs to them
 * before writing — a manager can only submit their own assignment, never
 * another manager's.
 */
export async function submitTaskProof(taskId, description, proofImageBase64) {
  const { session, error: authError } = await requireWritersManager();
  if (authError) return { error: authError };

  const id = parseInt(taskId, 10);
  if (!id || Number.isNaN(id)) {
    return { error: 'Invalid task' };
  }

  const cleanedDescription = (description || '').trim();
  if (!cleanedDescription) {
    return { error: 'Description is required' };
  }
  if (!proofImageBase64 || typeof proofImageBase64 !== 'string' || !proofImageBase64.startsWith('data:image/')) {
    return { error: 'Proof image is required' };
  }
  if (proofImageBase64.length > MAX_BASE64_LENGTH) {
    return { error: 'Proof image is too large (max 2MB)' };
  }

  try {
    const db = await getDb();

    const assignee = await db.prepare(`
      SELECT id FROM manager_task_assignees WHERE task_id = ? AND user_id = ?
    `).get(id, session.userId);
    if (!assignee) {
      return { error: 'This task is not assigned to you' };
    }

    await db.prepare(`
      UPDATE manager_task_assignees
      SET submission_description = ?, proof_image_base64 = ?, submitted_at = CURRENT_TIMESTAMP
      WHERE task_id = ? AND user_id = ?
    `).run(cleanedDescription, proofImageBase64, id, session.userId);

    revalidatePath('/writers-manager/tasks');

    return { success: true };
  } catch (err) {
    console.error('[ManagerTasks] submitTaskProof failed:', err);
    return { error: err.message || 'Failed to submit — please try again.' };
  }
}
