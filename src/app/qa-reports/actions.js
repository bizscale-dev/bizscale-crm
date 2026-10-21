'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { createNotificationsForUsers, getReportsLinkForRole } from '@/lib/notifications';
import { reportSubject } from '@/lib/qaReports';

// Shared by QA and the three manager portals — a comment thread on a QA
// report. QA can comment on any report; a manager only on their own. The
// other side is notified. (Admin sees the thread read-only.)
const MANAGER_ROLES = ['seo_manager', 'web_seo_manager', 'writers_manager'];

export async function addReportComment(reportId, body) {
  const session = await verifySession();
  if (!session) return { error: 'Not authorized' };
  const isQa = session.role === 'qa';
  if (!isQa && !MANAGER_ROLES.includes(session.role)) return { error: 'Not authorized' };

  const id = parseInt(reportId, 10);
  if (!id) return { error: 'Invalid report' };
  const text = (body || '').trim();
  if (!text) return { error: 'Write a comment first' };
  if (text.length > 2000) return { error: 'Comment is too long (max 2000 characters)' };

  const db = await getDb();
  const r = await db.prepare(`
    SELECT q.id, q.manager_id, q.qa_user_id, q.source, q.title, q.web_client_name, q.work_done,
      m.role AS manager_role, m.name AS manager_name
    FROM qa_reports q JOIN users m ON m.id = q.manager_id WHERE q.id = ?
  `).get(id);
  if (!r) return { error: 'Report not found' };
  if (!isQa && r.manager_id !== session.userId) return { error: 'Not your report' };

  await db.prepare(`INSERT INTO qa_report_comments (report_id, user_id, kind, body) VALUES (?, ?, 'comment', ?)`)
    .run(id, session.userId, text);

  if (isQa) {
    await createNotificationsForUsers(db, [r.manager_id], {
      title: 'New QA comment on your report',
      message: `${reportSubject(r)}: ${text.slice(0, 120)}`,
      link: getReportsLinkForRole(r.manager_role),
    });
  } else {
    await createNotificationsForUsers(db, [r.qa_user_id], {
      title: `${r.manager_name} commented on a report`,
      message: `${reportSubject(r)}: ${text.slice(0, 120)}`,
      link: '/qa/reports',
    });
  }

  revalidatePath('/qa/reports');
  revalidatePath('/qa/resolved');
  revalidatePath('/seo-manager/reports');
  revalidatePath('/web-seo-manager/reports');
  revalidatePath('/writers-manager/reports');
  return { success: true };
}
