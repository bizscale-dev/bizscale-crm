'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { fetchDueFollowUps, syncQaFollowUps } from '@/lib/qaReports';
import { notifyAdminOnGoogleChat } from '@/lib/googleChat';

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

// Closes a follow-up. With notifyAdmin the report is also posted to the admin's
// Google Chat space first (still not fixed); if that post fails nothing is
// marked, so QA can simply try again.
export async function markFollowUpChecked(reportId, { notifyAdmin = false, note = '' } = {}) {
  const session = await requireQa();
  if (!session) return { error: 'Not authorized' };
  const id = parseInt(reportId, 10);
  if (!id) return { error: 'Invalid report' };
  const db = await getDb();

  if (notifyAdmin) {
    const r = await db.prepare(`
      SELECT q.source, q.title, q.web_client_name, q.work_done, q.note, q.page_url, q.report_date, q.severity,
        q.status, q.created_at, m.name as manager_name, f.name as filed_by, c.name as checker
      FROM qa_reports q
      JOIN users m ON m.id = q.manager_id
      JOIN users f ON f.id = q.qa_user_id
      JOIN users c ON c.id = ?
      WHERE q.id = ? AND q.followup_checked_at IS NULL
    `).get(session.userId, id);
    if (!r) return { error: 'Already checked' };
    const subject = r.source === 'manager_task' ? `Task: ${(r.work_done || '').slice(0, 120)}` : (r.web_client_name || r.title || 'Report');
    const extra = String(note || '').trim().slice(0, 500);
    const lines = [
      `*QA follow-up: needs attention* (checked by ${r.checker})`,
      `Manager: ${r.manager_name}`,
      `About: ${subject}`,
      `Reported ${r.created_at.slice(0, 10)} by ${r.filed_by}${r.severity ? ` (${r.severity} severity)` : ''}`,
      `Issue: ${String(r.note || '').slice(0, 500)}`,
      `Manager's status: ${r.status === 'resolved' ? 'marked resolved, but QA is not satisfied' : 'not resolved yet'}`,
      r.page_url && `Links:\n${r.page_url}`,
      extra && `QA note: ${extra}`,
    ].filter(Boolean);
    const chat = await notifyAdminOnGoogleChat(lines.join('\n'));
    if (!chat.ok) return { error: `Couldn't notify the admin (${chat.error}). Nothing was marked — try again.` };
  }

  const result = await db.prepare(`
    UPDATE qa_reports SET followup_checked_at = CURRENT_TIMESTAMP, followup_checked_by = ?
    WHERE id = ? AND followup_checked_at IS NULL
  `).run(session.userId, id);
  if (!result.changes) return { error: 'Already checked' };
  return { success: true };
}
