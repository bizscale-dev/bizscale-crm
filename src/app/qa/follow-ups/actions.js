'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { fetchDueFollowUps, syncQaFollowUps } from '@/lib/qaReports';

async function requireQa() {
  const session = await verifySession();
  if (!session || session.role !== 'qa') return null;
  return session;
}

// Drives the nav dot; also creates the notifications for newly due follow-ups.
export async function getDueFollowUpCount() {
  if (!(await requireQa())) return 0;
  const db = await getDb();
  await syncQaFollowUps(db);
  return (await fetchDueFollowUps(db)).length;
}

export async function markFollowUpChecked(reportId) {
  const session = await requireQa();
  if (!session) return { error: 'Not authorized' };
  const id = parseInt(reportId, 10);
  if (!id) return { error: 'Invalid report' };
  const db = await getDb();
  const result = await db.prepare(`
    UPDATE qa_reports SET followup_checked_at = CURRENT_TIMESTAMP, followup_checked_by = ?
    WHERE id = ? AND followup_checked_at IS NULL
  `).run(session.userId, id);
  if (!result.changes) return { error: 'Already checked' };
  return { success: true };
}
