'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { submitFixForReview } from '@/lib/qaReports';

const ROLES = ['seo_associate', 'senior_seo_associate', 'web_seo_associate'];

async function requireAssociate() {
  const session = await verifySession();
  return session && ROLES.includes(session.role) ? session : null;
}

/** Still-unresolved QA reports on this associate's own links (feeds the Reports nav dot). */
export async function getOpenAssociateReportCount() {
  const session = await requireAssociate();
  if (!session) return 0;
  const db = await getDb();
  const row = await db.prepare("SELECT COUNT(*) AS c FROM qa_reports WHERE manager_id = ? AND status = 'open'").get(session.userId);
  return row?.c || 0;
}

/** The associate submits a fix for one QA report on their own list; QA reviews and confirms it. */
export async function resolveAssociateReport(reportId, note) {
  const session = await requireAssociate();
  if (!session) return { error: 'Not authorized' };
  const db = await getDb();
  const result = await submitFixForReview(db, session, reportId, note);
  if (result.error) return result;
  revalidatePath('/associate/reports');
  revalidatePath('/web-associate/reports');
  revalidatePath('/qa/reports');
  return { success: true };
}
