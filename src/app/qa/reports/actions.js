'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { createNotificationsForUsers, getReportsLinkForRole } from '@/lib/notifications';
import { reportSubject } from '@/lib/qaReports';

async function requireQa() {
  const session = await verifySession();
  if (!session || session.role !== 'qa') return null;
  return session;
}

function revalidateAll() {
  revalidatePath('/qa/reports');
  revalidatePath('/qa/resolved');
  revalidatePath('/seo-manager/reports');
  revalidatePath('/web-seo-manager/reports');
  revalidatePath('/writers-manager/reports');
}

// Fixes waiting for QA to verify — drives the badge on the Reports nav item.
export async function getPendingReviewCount() {
  if (!(await requireQa())) return 0;
  const db = await getDb();
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM qa_reports WHERE status = 'pending_review'`).get();
  return row?.c || 0;
}

async function loadPending(db, id) {
  return db.prepare(`
    SELECT q.id, q.source, q.title, q.web_client_name, q.work_done, q.manager_id, m.role AS manager_role
    FROM qa_reports q JOIN users m ON m.id = q.manager_id
    WHERE q.id = ? AND q.status = 'pending_review'
  `).get(id);
}

// The fix passed QA: only now does the report count as resolved.
export async function confirmReportFix(reportId, comment) {
  const session = await requireQa();
  if (!session) return { error: 'Not authorized' };
  const id = parseInt(reportId, 10);
  if (!id) return { error: 'Invalid report' };
  const text = (comment || '').trim().slice(0, 2000);

  const db = await getDb();
  const r = await loadPending(db, id);
  if (!r) return { error: 'This report is not waiting for review' };

  const result = await db.prepare(`
    UPDATE qa_reports SET status = 'resolved', confirmed_at = CURRENT_TIMESTAMP, confirmed_by = ?
    WHERE id = ? AND status = 'pending_review'
  `).run(session.userId, id);
  if (!result.changes) return { error: 'This report is not waiting for review' };

  await db.prepare(`INSERT INTO qa_report_comments (report_id, user_id, kind, body) VALUES (?, ?, 'confirmed', ?)`)
    .run(id, session.userId, text || 'Fix confirmed — passed QA.');
  await createNotificationsForUsers(db, [r.manager_id], {
    title: 'QA confirmed your fix',
    message: `${reportSubject(r)} passed QA and is now resolved${text ? `: ${text.slice(0, 100)}` : ''}`,
    link: getReportsLinkForRole(r.manager_role),
  });
  revalidateAll();
  return { success: true };
}

// The fix failed QA: the report goes back to open and the manager is told why.
export async function rejectReportFix(reportId, reason) {
  const session = await requireQa();
  if (!session) return { error: 'Not authorized' };
  const id = parseInt(reportId, 10);
  if (!id) return { error: 'Invalid report' };
  const text = (reason || '').trim();
  if (!text) return { error: 'Explain why it failed QA' };
  if (text.length > 2000) return { error: 'Comment is too long (max 2000 characters)' };

  const db = await getDb();
  const r = await loadPending(db, id);
  if (!r) return { error: 'This report is not waiting for review' };

  const result = await db.prepare(`
    UPDATE qa_reports
    SET status = 'open', resolved_at = NULL, resolution_note = NULL, resolved_by = NULL,
        rejection_count = rejection_count + 1
    WHERE id = ? AND status = 'pending_review'
  `).run(id);
  if (!result.changes) return { error: 'This report is not waiting for review' };

  await db.prepare(`INSERT INTO qa_report_comments (report_id, user_id, kind, body) VALUES (?, ?, 'rejected', ?)`)
    .run(id, session.userId, text);
  await createNotificationsForUsers(db, [r.manager_id], {
    title: 'QA rejected your fix',
    message: `${reportSubject(r)} failed QA and is open again: ${text.slice(0, 120)}`,
    link: getReportsLinkForRole(r.manager_role),
  });
  revalidateAll();
  return { success: true };
}

// QA works as a team, so any QA user can remove a report they (or a
// colleague) filed by mistake. It disappears from the manager's Reports page
// and the follow-up list too.
export async function deleteQaReport(reportId) {
  const session = await requireQa();
  if (!session) return { error: 'Not authorized' };
  const id = parseInt(reportId, 10);
  if (!id) return { error: 'Invalid report' };

  const db = await getDb();
  await db.prepare('DELETE FROM qa_report_comments WHERE report_id = ?').run(id);
  const result = await db.prepare('DELETE FROM qa_reports WHERE id = ?').run(id);
  if (!result.changes) return { error: 'Report not found' };
  revalidateAll();
  return { success: true };
}
