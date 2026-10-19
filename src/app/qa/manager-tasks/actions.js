'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { createNotificationsForUsers, getReportsLinkForRole } from '@/lib/notifications';
import { QA_RESOLVE_DAYS } from '@/lib/qaReports';

const MANAGER_ROLES = ['seo_manager', 'web_seo_manager', 'writers_manager'];

async function requireQa() {
  const session = await verifySession();
  if (!session || session.role !== 'qa') {
    return { error: 'Not authorized' };
  }
  return { session };
}

/**
 * QA flags one manager's task (admin -> manager assignment, and their
 * submission of it) as unsatisfactory, with a note. Goes into the same
 * qa_reports table/flow as EOD reports: the manager is notified, gets
 * QA_RESOLVE_DAYS to resolve it, and their Reports tab blinks until then.
 *
 * Looks the assignment up server-side (never trusts client-supplied manager
 * or task values) and snapshots the task text/due date into the report so it
 * stays readable if the task is later edited. For source='manager_task' the
 * NOT NULL eod_report_id/eod_entry_id columns hold 0 (see db.js).
 */
export async function reportManagerTask(assigneeId, note) {
  const { session, error } = await requireQa();
  if (error) return { error };

  const id = parseInt(assigneeId, 10);
  if (!id) return { error: 'Invalid task' };

  const cleanNote = (note || '').trim();
  if (!cleanNote) return { error: 'Please add a note explaining the problem' };
  if (cleanNote.length > 2000) return { error: 'Note is too long (max 2000 characters)' };

  const db = await getDb();
  const placeholders = MANAGER_ROLES.map(() => '?').join(',');
  const row = await db.prepare(`
    SELECT a.id, a.user_id as manager_id, u.role as manager_role,
      t.task_text, t.due_date
    FROM manager_task_assignees a
    JOIN manager_tasks t ON t.id = a.task_id
    JOIN users u ON u.id = a.user_id
    WHERE a.id = ? AND u.role IN (${placeholders})
  `).get(id, ...MANAGER_ROLES);
  if (!row) return { error: 'Task not found' };

  await db.prepare(`
    INSERT INTO qa_reports
      (qa_user_id, manager_id, eod_report_id, eod_entry_id, report_date, web_client_name, page_url, work_done, note, source, task_assignee_id)
    VALUES (?, ?, 0, 0, ?, 'Manager Task', NULL, ?, ?, 'manager_task', ?)
  `).run(session.userId, row.manager_id, row.due_date, row.task_text.slice(0, 1000), cleanNote, row.id);

  await createNotificationsForUsers(db, [row.manager_id], {
    title: 'New QA Report on your task',
    message: `${row.task_text.slice(0, 70)}${row.task_text.length > 70 ? '…' : ''}: ${cleanNote.slice(0, 100)} — resolve within ${QA_RESOLVE_DAYS} working days`,
    link: getReportsLinkForRole(row.manager_role),
  });

  revalidatePath('/qa/reports');
  return { success: true };
}
