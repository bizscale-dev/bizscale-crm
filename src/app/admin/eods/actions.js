'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';

/**
 * Every EOD report filed by one Web SEO Manager, newest date first, optionally
 * narrowed by web client and/or date. Both filters are independent and optional —
 * passing neither returns their full history.
 *
 * Filtering by web client narrows to the matching ENTRIES (and drops reports left
 * with none), so "client X on date Y" shows just that client's work that day rather
 * than the whole day's report.
 */
export async function getManagerEodReports(userId, filters = {}) {
  const session = await verifySession();
  if (!session || session.role !== 'admin') {
    return { error: 'Not authorized' };
  }

  const db = await getDb();

  const manager = await db.prepare(
    "SELECT id, name, email FROM users WHERE id = ? AND role = 'web_seo_manager'"
  ).get(userId);
  if (!manager) return { error: 'Web SEO Manager not found' };

  const conditions = ['r.user_id = ?'];
  const args = [userId];

  // web_client_id 0 is a valid sentinel (a manually-typed heading, no real web_clients
  // row — see submitEodReport), so this can't be a plain truthy check on the parsed
  // number or filtering by that option would silently no-op.
  const webClientId = filters.webClientId !== undefined && filters.webClientId !== null && filters.webClientId !== ''
    ? parseInt(filters.webClientId, 10)
    : null;
  if (webClientId !== null && !Number.isNaN(webClientId)) {
    conditions.push('e.web_client_id = ?');
    args.push(webClientId);
  }

  if (filters.date) {
    conditions.push('r.report_date = ?');
    args.push(filters.date);
  }

  const rows = await db.prepare(`
    SELECT r.id as report_id, r.report_date, r.created_at,
      e.id as entry_id, e.web_client_id, e.web_client_name, e.page_url, e.work_done, e.description
    FROM eod_reports r
    JOIN eod_report_entries e ON e.report_id = r.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY r.report_date DESC, e.id ASC
  `).all(...args);

  // Collapse the joined rows back into one group per report date.
  const byReport = new Map();
  for (const row of rows) {
    if (!byReport.has(row.report_id)) {
      byReport.set(row.report_id, {
        id: row.report_id,
        report_date: row.report_date,
        created_at: row.created_at,
        entries: [],
      });
    }
    byReport.get(row.report_id).entries.push({
      id: row.entry_id,
      web_client_id: row.web_client_id,
      web_client_name: row.web_client_name,
      page_url: row.page_url,
      work_done: row.work_done,
      description: row.description,
    });
  }

  return {
    manager: { id: manager.id, name: manager.name, email: manager.email },
    reports: [...byReport.values()],
  };
}
