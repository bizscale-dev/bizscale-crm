'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { fetchManagerEodReports, EOD_MANAGER_ROLES } from '@/lib/qaEod';
import { createNotificationsForUsers, getReportsLinkForRole } from '@/lib/notifications';
import { QA_RESOLVE_DAYS } from '@/lib/qaReports';

async function requireQa() {
  const session = await verifySession();
  if (!session || session.role !== 'qa') {
    return { error: 'Not authorized' };
  }
  return { session };
}

// Filtered re-query for the QA EOD view (website + date), same as the
// admin EOD view's server-side filtering but open to all 3 manager roles.
export async function getQaManagerEodReports(managerId, filters = {}) {
  const { error } = await requireQa();
  if (error) return { error };

  const db = await getDb();
  const placeholders = EOD_MANAGER_ROLES.map(() => '?').join(',');
  const manager = await db.prepare(
    `SELECT id FROM users WHERE id = ? AND role IN (${placeholders})`
  ).get(managerId, ...EOD_MANAGER_ROLES);
  if (!manager) return { error: 'Manager not found' };

  return fetchManagerEodReports(db, managerId, filters);
}

/**
 * QA flags one EOD entry as unsatisfactory, with a note. Looks the entry up
 * server-side (never trusts client-supplied manager/date/link values) and
 * snapshots its date/client/link/work into the report so it stays readable
 * even if the EOD is later edited.
 */
export async function reportEodEntry(entryId, note) {
  const { session, error } = await requireQa();
  if (error) return { error };

  const id = parseInt(entryId, 10);
  if (!id) return { error: 'Invalid entry' };

  const cleanNote = (note || '').trim();
  if (!cleanNote) return { error: 'Please add a note explaining the problem' };
  if (cleanNote.length > 2000) return { error: 'Note is too long (max 2000 characters)' };

  const db = await getDb();
  const entry = await db.prepare(`
    SELECT e.id, e.report_id, e.web_client_name, e.page_url, e.work_done,
      r.report_date, r.user_id as manager_id, m.role as manager_role
    FROM eod_report_entries e
    JOIN eod_reports r ON r.id = e.report_id
    JOIN users m ON m.id = r.user_id
    WHERE e.id = ?
  `).get(id);
  if (!entry) return { error: 'EOD entry not found' };

  await db.prepare(`
    INSERT INTO qa_reports
      (qa_user_id, manager_id, eod_report_id, eod_entry_id, report_date, web_client_name, page_url, work_done, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    session.userId, entry.manager_id, entry.report_id, entry.id,
    entry.report_date, entry.web_client_name, entry.page_url || null, entry.work_done || null, cleanNote
  );

  // Tell the manager — shows up in their bell (with the desktop toast/sound)
  // and the login dialog; their Reports nav dot keeps blinking until they
  // resolve it.
  await createNotificationsForUsers(db, [entry.manager_id], {
    title: 'New QA Report on your EOD',
    message: `${entry.web_client_name} (EOD ${entry.report_date}): ${cleanNote.slice(0, 120)} — resolve within ${QA_RESOLVE_DAYS} working days`,
    link: getReportsLinkForRole(entry.manager_role),
  });

  revalidatePath('/qa/reports');
  return { success: true };
}
