'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { submitFixForReview } from '@/lib/qaReports';

async function requireSeoManager() {
  const session = await verifySession();
  if (!session || session.role !== 'seo_manager') {
    return { error: 'Not authorized' };
  }
  return { session };
}

/**
 * Count of this manager's still-unresolved QA reports — feeds the Reports
 * nav item's blinking dot (see SeoManagerLayoutClient.jsx). Stays > 0 until
 * every report is resolved, with no due-date gating: an overdue report keeps
 * the dot blinking, same as an unsubmitted task on the Tasks tab.
 */
export async function getOpenReportCount() {
  const { session, error } = await requireSeoManager();
  if (error) return 0;

  const db = await getDb();
  const row = await db.prepare(`
    SELECT COUNT(*) as c FROM qa_reports WHERE manager_id = ? AND status = 'open'
  `).get(session.userId);
  return row?.c || 0;
}

/**
 * The manager submits a fix for one QA report on their own list. It does not
 * resolve it: it goes to QA for review (see submitFixForReview in
 * src/lib/qaReports.js) and only counts as resolved once QA confirms. A note
 * on what was done is required.
 */
export async function resolveReport(reportId, note) {
  const { session, error } = await requireSeoManager();
  if (error) return { error };

  const db = await getDb();
  const result = await submitFixForReview(db, session, reportId, note);
  if (result.error) return result;

  revalidatePath('/seo-manager/reports');
  revalidatePath('/qa/reports');
  return { success: true };
}
