'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { ensureRecurringAssociateTasks } from '@/lib/recurringAssociateTasks';

// ~2MB of raw image bytes, inflated by base64's ~1.37x overhead — matches the
// client-side cap in ManagerTasksClient.jsx. Re-validated here since
// client-side validation alone isn't trustworthy.
const MAX_BASE64_LENGTH = 2 * 1024 * 1024 * 1.37;

async function requireSeoAssociate() {
  const session = await verifySession();
  if (!session || !['seo_associate', 'senior_seo_associate'].includes(session.role)) {
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
  const { session, error } = await requireSeoAssociate();
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
  const { session, error: authError } = await requireSeoAssociate();
  if (authError) return { error: authError };

  const id = parseInt(taskId, 10);
  if (!id || Number.isNaN(id)) {
    return { error: 'Invalid task' };
  }

  const cleanedDescription = (description || '').trim();
  if (!cleanedDescription) {
    return { error: 'Description is required' };
  }
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
        is_late = ?, late_reason = ?, approval_status = ?
      WHERE task_id = ? AND user_id = ?
    `).run(
      cleanedDescription, hasImage ? proofImageBase64 : null, isLate ? 1 : 0,
      isLate ? cleanedLateReason : null, isLate ? 'pending' : null,
      id, session.userId
    );

    revalidatePath('/associate/manager-tasks');

    return { success: true, isLate };
  } catch (err) {
    console.error('[AssociateTasks] submitAssociateTaskProof failed:', err);
    return { error: err.message || 'Failed to submit — please try again.' };
  }
}

/**
 * Ticks or unticks one client of a monthly "check every client" task (the ranking checks) for the
 * signed-in associate. The task submits itself once every client is ticked: the description lists the
 * clients, and a task finished after its due time goes to their manager for approval like any late one.
 */
export async function setClientCheck(taskId, index, checked) {
  const { session, error: authError } = await requireSeoAssociate();
  if (authError) return { error: authError };

  const id = parseInt(taskId, 10);
  const idx = parseInt(index, 10);
  if (!id || Number.isNaN(idx) || idx < 0) return { error: 'Invalid item' };

  try {
    const db = await getDb();
    const row = await db.prepare(`
      SELECT a.id, a.submitted_at, a.checklist, a.checklist_done, t.kind, t.task_text, t.due_date, t.due_time
      FROM associate_task_assignees a JOIN associate_tasks t ON t.id = a.task_id
      WHERE a.task_id = ? AND a.user_id = ?
    `).get(id, session.userId);
    if (!row || row.kind !== 'monthly_clients') return { error: 'This task is not assigned to you' };
    if (row.submitted_at) return { error: 'This task is already done' };

    let clients = [];
    try { clients = JSON.parse(row.checklist || '[]'); } catch { clients = []; }
    if (!Array.isArray(clients) || idx >= clients.length) return { error: 'Invalid client' };

    let done = [];
    try { done = JSON.parse(row.checklist_done || '[]'); } catch { done = []; }
    const set = new Set(Array.isArray(done) ? done : []);
    if (checked) set.add(idx); else set.delete(idx);
    const doneIdx = [...set].sort((a, b) => a - b);

    await db.prepare('UPDATE associate_task_assignees SET checklist_done = ? WHERE id = ?').run(JSON.stringify(doneIdx), row.id);

    let submitted = false;
    if (clients.length > 0 && doneIdx.length === clients.length) {
      const title = row.task_text.split(/\s+[—-]\s+/)[0].trim();
      const description = `${title}: all ${clients.length} clients checked\n${clients.map((n) => `✓ ${n}`).join('\n')}`;
      const dueAt = new Date(`${row.due_date}T${row.due_time}:00`);
      const isLate = Number.isNaN(dueAt.getTime()) ? false : new Date() > dueAt;
      await db.prepare(`
        UPDATE associate_task_assignees
        SET submission_description = ?, submitted_at = CURRENT_TIMESTAMP, is_late = ?, late_reason = ?, approval_status = ?
        WHERE id = ?
      `).run(description, isLate ? 1 : 0, isLate ? 'Last client was checked after the due time' : null, isLate ? 'pending' : null, row.id);
      submitted = true;
    }

    revalidatePath('/associate/manager-tasks');
    return { success: true, submitted };
  } catch (err) {
    console.error('[AssociateTasks] setClientCheck failed:', err);
    return { error: 'Could not save — please try again.' };
  }
}
