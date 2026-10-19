'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';

async function requireWritersManager() {
  const session = await verifySession();
  if (!session || session.role !== 'writers_manager') {
    return { error: 'Not authorized' };
  }
  return { session };
}

/**
 * Count of this manager's still-unresolved QA reports — feeds the Reports
 * nav item's blinking dot (see WritersManagerLayoutClient.jsx). Stays > 0 until
 * every report is resolved, with no due-date gating: an overdue report keeps
 * the dot blinking, same as an unsubmitted task on the Tasks tab.
 */
export async function getOpenReportCount() {
  const { session, error } = await requireWritersManager();
  if (error) return 0;

  const db = await getDb();
  const row = await db.prepare(`
    SELECT COUNT(*) as c FROM qa_reports WHERE manager_id = ? AND status = 'open'
  `).get(session.userId);
  return row?.c || 0;
}

/**
 * Resolves one QA report on this manager's own EOD. Scoped by manager_id in
 * the UPDATE itself, so a manager can only ever resolve their own reports,
 * and only while still open. A note on what was done is required — QA reads
 * it on their Reports page.
 */
export async function resolveReport(reportId, note) {
  const { session, error } = await requireWritersManager();
  if (error) return { error };

  const id = parseInt(reportId, 10);
  if (!id) return { error: 'Invalid report' };

  const cleanNote = (note || '').trim();
  if (!cleanNote) return { error: 'Please describe how you resolved it' };
  if (cleanNote.length > 2000) return { error: 'Note is too long (max 2000 characters)' };

  const db = await getDb();
  const result = await db.prepare(`
    UPDATE qa_reports
    SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP, resolution_note = ?, resolved_by = ?
    WHERE id = ? AND manager_id = ? AND status = 'open'
  `).run(cleanNote, session.userId, id, session.userId);

  if (!result.changes) return { error: 'This report is already resolved or not yours' };

  revalidatePath('/writers-manager/reports');
  revalidatePath('/qa/reports');
  return { success: true };
}
