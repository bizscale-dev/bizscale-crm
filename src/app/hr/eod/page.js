import { getDb } from '@/lib/db';
import EodView from './EodView';

export const revalidate = 0;

const ROLE_LABELS = {
  seo_manager: 'SEO Manager',
  web_seo_manager: 'Web SEO Manager',
  writers_manager: 'Writers Manager',
};

export default async function HrEodPage() {
  const db = await getDb();

  // EOD reports are filed by the 3 manager roles — same tables already
  // read-only at /admin/eods, just unified here into one filterable list.
  const rows = await db.prepare(`
    SELECT r.id as report_id, r.report_date, u.id as manager_id, u.name as manager_name, u.role as manager_role,
      e.id as entry_id, e.web_client_name, e.page_url, e.work_done, e.description
    FROM eod_reports r
    JOIN users u ON u.id = r.user_id
    JOIN eod_report_entries e ON e.report_id = r.id
    ORDER BY r.report_date DESC, u.name ASC, e.id ASC
  `).all();

  const byReport = new Map();
  for (const row of rows) {
    if (!byReport.has(row.report_id)) {
      byReport.set(row.report_id, {
        id: row.report_id,
        report_date: row.report_date,
        manager_id: row.manager_id,
        manager_name: row.manager_name,
        manager_role: ROLE_LABELS[row.manager_role] || row.manager_role,
        entries: [],
      });
    }
    byReport.get(row.report_id).entries.push({
      id: row.entry_id,
      web_client_name: row.web_client_name,
      page_url: row.page_url,
      work_done: row.work_done,
      description: row.description,
    });
  }

  return <EodView reports={[...byReport.values()]} />;
}
