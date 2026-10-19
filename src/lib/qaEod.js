export const EOD_MANAGER_ROLES = ['web_seo_manager', 'seo_manager', 'writers_manager'];

/**
 * One manager's EOD reports, newest date first, optionally narrowed by web
 * client and/or date (both independent and optional). Same shape and
 * filtering semantics as the admin EOD view (admin/eods/actions.js) — except
 * that one only accepts web_seo_manager, while QA reviews all 3 manager
 * roles that file EODs. Also returns how many QA reports already exist per
 * entry so the UI can mark entries that were flagged.
 *
 * Filtering by web client narrows to matching ENTRIES (dropping reports left
 * with none), so "client X on date Y" shows just that client's work that day.
 */
export async function fetchManagerEodReports(db, managerId, filters = {}) {
  const conditions = ['r.user_id = ?'];
  const args = [managerId];

  // web_client_id 0 is a valid sentinel (a manually-typed heading with no real
  // web_clients row), so this can't be a plain truthy check.
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

  const counts = await db.prepare(`
    SELECT eod_entry_id, COUNT(*) as c FROM qa_reports WHERE manager_id = ? GROUP BY eod_entry_id
  `).all(managerId);
  const reportCounts = {};
  for (const c of counts) reportCounts[c.eod_entry_id] = c.c;

  return { reports: [...byReport.values()], reportCounts };
}
