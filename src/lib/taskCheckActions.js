'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { createNotificationsForUsers, getCheckReportsLinkForRole } from '@/lib/notifications';
import { CHECK_TARGETS, CHECKED_ROLES } from '@/lib/taskCheck';

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function requireExec() {
  const session = await verifySession();
  const cfg = session ? CHECK_TARGETS[session.role] : null;
  return cfg ? { session, cfg } : null;
}

// The submitted assignee row (task + person) this Executive is allowed to check.
async function loadSubmitted(db, cfg, taskId, userId) {
  return db.prepare(`
    SELECT t.id AS task_id, t.task_text, u.id AS user_id, u.name AS user_name, u.role AS user_role
    FROM associate_task_assignees a
    JOIN associate_tasks t ON t.id = a.task_id
    JOIN users u ON u.id = a.user_id
    WHERE a.task_id = ? AND a.user_id = ? AND u.role = ? AND a.submitted_at IS NOT NULL
  `).get(taskId, userId, cfg.targetRole);
}

/** Pass / Fail mark on one submitted task (status '' clears it). */
export async function setTaskCheck({ taskId, userId, status }) {
  const ctx = await requireExec();
  if (!ctx) return { error: 'Not authorized' };
  if (!['pass', 'fail', ''].includes(status)) return { error: 'Invalid status' };
  const tid = parseInt(taskId, 10);
  const uid = parseInt(userId, 10);
  const db = await getDb();
  if (!(await loadSubmitted(db, ctx.cfg, tid, uid))) return { error: 'Task not found' };

  if (status === '') {
    await db.prepare('DELETE FROM task_checks WHERE task_id = ? AND user_id = ?').run(tid, uid);
  } else {
    await db.prepare(`
      INSERT INTO task_checks (task_id, user_id, status, checked_by) VALUES (?, ?, ?, ?)
      ON CONFLICT(task_id, user_id) DO UPDATE SET status = excluded.status, checked_by = excluded.checked_by, checked_at = CURRENT_TIMESTAMP
    `).run(tid, uid, status, ctx.session.userId);
  }
  return { success: true };
}

/**
 * Report one submitted task. Only a comment is typed (optional); the task and the person come from the
 * row. The reported person is notified with the task text and the comment, the task is marked Fail, and
 * the report goes on both people's Reports pages until it is fixed and confirmed.
 */
export async function reportTask({ taskId, userId, comment }) {
  const ctx = await requireExec();
  if (!ctx) return { error: 'Not authorized' };
  const tid = parseInt(taskId, 10);
  const uid = parseInt(userId, 10);
  const note = clean(comment, 3000);
  const db = await getDb();
  const row = await loadSubmitted(db, ctx.cfg, tid, uid);
  if (!row) return { error: 'Task not found' };

  await db.prepare(`
    INSERT INTO task_check_reports (task_id, user_id, created_by, task_text, comment) VALUES (?, ?, ?, ?, ?)
  `).run(tid, uid, ctx.session.userId, row.task_text, note || null);
  await db.prepare(`
    INSERT INTO task_checks (task_id, user_id, status, checked_by) VALUES (?, ?, 'fail', ?)
    ON CONFLICT(task_id, user_id) DO UPDATE SET status = 'fail', checked_by = excluded.checked_by, checked_at = CURRENT_TIMESTAMP
  `).run(tid, uid, ctx.session.userId);

  const short = row.task_text.length > 120 ? `${row.task_text.slice(0, 120)}…` : row.task_text;
  await createNotificationsForUsers(db, [uid], {
    title: `${ctx.cfg.execLabel} reported one of your tasks`,
    message: `${short}${note ? ` — "${note.slice(0, 160)}"` : ''}`,
    link: getCheckReportsLinkForRole(row.user_role),
  });

  revalidatePath(`${ctx.cfg.base}/checks`);
  revalidatePath(`${ctx.cfg.base}/reports`);
  return { success: true, name: row.user_name };
}

/** The reported person says it is fixed: goes to the Executive for confirmation. */
export async function markReportFixed(reportId, note) {
  const session = await verifySession();
  if (!session || !CHECKED_ROLES.includes(session.role)) return { error: 'Not authorized' };
  const id = parseInt(reportId, 10);
  const text = clean(note, 3000);
  if (!text) return { error: 'Say what you fixed' };
  const db = await getDb();
  const report = await db.prepare("SELECT id, task_text, created_by FROM task_check_reports WHERE id = ? AND user_id = ? AND status = 'open'").get(id, session.userId);
  if (!report) return { error: 'Report not found' };

  await db.prepare("UPDATE task_check_reports SET status = 'pending_review', resolution_note = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?").run(text, id);
  const exec = await db.prepare('SELECT id, role FROM users WHERE id = ?').get(report.created_by);
  if (exec) {
    await createNotificationsForUsers(db, [exec.id], {
      title: 'A reported task was fixed',
      message: `${report.task_text.slice(0, 120)} — "${text.slice(0, 160)}". Check it and confirm.`,
      link: getCheckReportsLinkForRole(exec.role),
    });
  }
  revalidatePath('/web-developer/reports');
  revalidatePath('/graphic-designer/reports');
  return { success: true };
}

async function loadOwnReview(db, cfg, reportId) {
  return db.prepare(`
    SELECT r.id, r.task_text, r.user_id, u.role AS user_role FROM task_check_reports r
    JOIN users u ON u.id = r.user_id
    WHERE r.id = ? AND r.status = 'pending_review' AND u.role = ?
  `).get(reportId, cfg.targetRole);
}

/** The Executive confirms the fix: the report is resolved. */
export async function confirmTaskReportFix(reportId) {
  const ctx = await requireExec();
  if (!ctx) return { error: 'Not authorized' };
  const db = await getDb();
  const r = await loadOwnReview(db, ctx.cfg, parseInt(reportId, 10));
  if (!r) return { error: 'Report not found' };
  await db.prepare("UPDATE task_check_reports SET status = 'resolved', confirmed_at = CURRENT_TIMESTAMP WHERE id = ?").run(r.id);
  await createNotificationsForUsers(db, [r.user_id], {
    title: 'Your fix was confirmed',
    message: r.task_text.slice(0, 160),
    link: getCheckReportsLinkForRole(r.user_role),
  });
  revalidatePath(`${ctx.cfg.base}/reports`);
  return { success: true };
}

/** The Executive says it is still not right: the report reopens with the reason. */
export async function rejectTaskReportFix(reportId, reason) {
  const ctx = await requireExec();
  if (!ctx) return { error: 'Not authorized' };
  const why = clean(reason, 3000);
  if (!why) return { error: 'Say what is still wrong' };
  const db = await getDb();
  const r = await loadOwnReview(db, ctx.cfg, parseInt(reportId, 10));
  if (!r) return { error: 'Report not found' };
  await db.prepare(`
    UPDATE task_check_reports SET status = 'open', rejection_count = rejection_count + 1,
      comment = COALESCE(comment || char(10) || char(10), '') || 'Still not fixed: ' || ?
    WHERE id = ?
  `).run(why, r.id);
  await createNotificationsForUsers(db, [r.user_id], {
    title: 'Your fix was not accepted',
    message: `${r.task_text.slice(0, 100)} — "${why.slice(0, 160)}"`,
    link: getCheckReportsLinkForRole(r.user_role),
  });
  revalidatePath(`${ctx.cfg.base}/reports`);
  return { success: true };
}

/** Nav badge: reports waiting on the reported person (open) or on the Executive (pending_review). */
export async function getTaskCheckBadgeCount() {
  const session = await verifySession();
  if (!session) return 0;
  const db = await getDb();
  if (CHECKED_ROLES.includes(session.role)) {
    const row = await db.prepare("SELECT COUNT(*) AS c FROM task_check_reports WHERE user_id = ? AND status = 'open'").get(session.userId);
    return row?.c || 0;
  }
  const cfg = CHECK_TARGETS[session.role];
  if (!cfg) return 0;
  const row = await db.prepare(`
    SELECT COUNT(*) AS c FROM task_check_reports r JOIN users u ON u.id = r.user_id
    WHERE r.status = 'pending_review' AND u.role = ?
  `).get(cfg.targetRole);
  return row?.c || 0;
}
