'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';

// QA works as a team, so any QA user can remove a report they (or a
// colleague) filed by mistake. It disappears from the manager's Reports page
// and the follow-up list too.
export async function deleteQaReport(reportId) {
  const session = await verifySession();
  if (!session || session.role !== 'qa') return { error: 'Not authorized' };
  const id = parseInt(reportId, 10);
  if (!id) return { error: 'Invalid report' };

  const db = await getDb();
  const result = await db.prepare('DELETE FROM qa_reports WHERE id = ?').run(id);
  if (!result.changes) return { error: 'Report not found' };
  return { success: true };
}
