'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { createNotificationsForUsers, getCheckReportsLinkForRole } from '@/lib/notifications';
import { CHECK_TARGETS, CHECKED_ROLES } from '@/lib/taskCheck';
import { submitFixForReview, QA_MAX_SCREENSHOT_BASE64 } from '@/lib/qaReports';

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

  revalidatePath(ctx.cfg.checksPath);
  revalidatePath(ctx.cfg.reportsPath);
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
  revalidatePath(ctx.cfg.reportsPath);
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
  revalidatePath(ctx.cfg.reportsPath);
  return { success: true };
}

/** Nav badge: reports waiting on the reported person (open) or on the Executive (pending_review). */
export async function getTaskCheckBadgeCount() {
  const session = await verifySession();
  if (!session) return 0;
  const db = await getDb();
  const qaOpen = async () => (await db.prepare("SELECT COUNT(*) AS c FROM qa_reports WHERE manager_id = ? AND status = 'open'").get(session.userId))?.c || 0;
  if (CHECKED_ROLES.includes(session.role)) {
    const row = await db.prepare("SELECT COUNT(*) AS c FROM task_check_reports WHERE user_id = ? AND status = 'open'").get(session.userId);
    return (row?.c || 0) + (await qaOpen());
  }
  const cfg = CHECK_TARGETS[session.role];
  if (!cfg) return 0;
  const row = await db.prepare(`
    SELECT COUNT(*) AS c FROM task_check_reports r JOIN users u ON u.id = r.user_id
    WHERE r.status = 'pending_review' AND u.role = ?
  `).get(cfg.targetRole);
  return row?.c || 0;
}

/** The reported person submits a fix for a QA report on their own list (goes to QA for review). */
export async function resolveQaReport(reportId, note) {
  const session = await verifySession();
  if (!session || ![...CHECKED_ROLES, 'web_developer_executive', 'graphic_designer_executive'].includes(session.role)) return { error: 'Not authorized' };
  const db = await getDb();
  const result = await submitFixForReview(db, session, reportId, note);
  if (result.error) return result;
  revalidatePath('/web-developer/reports');
  revalidatePath('/graphic-designer/reports');
  revalidatePath('/web-dev-executive/reports');
  revalidatePath('/graphic-executive/reports');
  revalidatePath('/qa/reports');
  return { success: true };
}

/**
 * An Executive highlights a bug by hand on one of their team (no task involved): a description, plus an
 * optional picture and link. It goes through the same fix-and-confirm flow as a task report: the person is
 * notified, fixes it and marks it fixed, and the Executive confirms or sends it back.
 */
export async function reportBug({ userId, description, link, image }) {
  const ctx = await requireExec();
  if (!ctx) return { error: 'Not authorized' };
  const uid = parseInt(userId, 10);
  const text = clean(description, 3000);
  if (!uid) return { error: `Pick the ${ctx.cfg.targetLabel}` };
  if (!text) return { error: 'Describe the bug' };

  let url = clean(link, 2000);
  if (url) {
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { new URL(url); } catch { return { error: 'That link does not look valid' }; }
  }
  if (image) {
    if (typeof image !== 'string' || !/^data:image\/[a-z0-9.+-]+;base64,/i.test(image)) return { error: 'The picture looks invalid — try attaching it again' };
    if (image.length > QA_MAX_SCREENSHOT_BASE64) return { error: 'The picture is too large (max 2MB)' };
  }

  const db = await getDb();
  const person = await db.prepare('SELECT id, name, role FROM users WHERE id = ? AND role = ? AND is_active = 1').get(uid, ctx.cfg.targetRole);
  if (!person) return { error: `${ctx.cfg.targetLabel} not found` };

  const title = `Bug: ${text.replace(/\s+/g, ' ').slice(0, 100)}`;
  await db.prepare(`
    INSERT INTO task_check_reports (task_id, user_id, created_by, task_text, comment, image_base64, link)
    VALUES (0, ?, ?, ?, ?, ?, ?)
  `).run(person.id, ctx.session.userId, title, text, image || null, url || null);

  await createNotificationsForUsers(db, [person.id], {
    title: `${ctx.cfg.execLabel} reported a bug`,
    message: text.length > 140 ? `${text.slice(0, 140)}…` : text,
    link: getCheckReportsLinkForRole(person.role),
  });

  revalidatePath(ctx.cfg.reportsPath);
  return { success: true, name: person.name };
}
