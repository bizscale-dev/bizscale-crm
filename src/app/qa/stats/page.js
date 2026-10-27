import { getDb } from '@/lib/db';
import { withQaDue } from '@/lib/qaReports';
import QaStatsClient from './QaStatsClient';

export const revalidate = 0;

export default async function QaStatsPage() {
  const db = await getDb();

  const managers = await db.prepare(`
    SELECT id, name, role FROM users
    WHERE role IN ('web_seo_manager', 'seo_manager', 'writers_manager') AND is_active = 1
    ORDER BY role, name
  `).all();

  // Every report ever filed (screenshots deliberately left out — they're big
  // and the stats view never shows them). The view filters by manager and
  // date range in the browser, so switching filters is instant.
  const rows = await db.prepare(`
    SELECT q.id, q.source, q.status, q.created_at, q.resolve_days, q.resolved_at,
      q.severity, q.title, q.web_client_name, q.work_done, q.note,
      q.manager_id, m.name as manager_name, m.role as manager_role
    FROM qa_reports q
    JOIN users m ON m.id = q.manager_id
    ORDER BY q.created_at DESC
  `).all();

  const today = new Date().toISOString().split('T')[0];

  return <QaStatsClient reports={withQaDue(rows)} managers={managers} today={today} />;
}
