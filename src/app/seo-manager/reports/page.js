import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import ManagerQaReports from '@/components/ManagerQaReports';
import { QA_RESOLVE_DAYS, withQaDue } from '@/lib/qaReports';
import { resolveReport } from './actions';

export const revalidate = 0;

export default async function SeoManagerReportsPage() {
  const session = await verifySession();
  const db = await getDb();

  // Open reports first (soonest deadline on top), then resolved, newest first.
  const rows = await db.prepare(`
    SELECT q.id, q.report_date, q.web_client_name, q.page_url, q.work_done, q.note,
      q.source, q.title, q.location, q.issue, q.department, q.severity, q.screenshot_base64, q.client_names,
      q.status, q.created_at, q.resolved_at, q.resolution_note,
      f.name as filed_by
    FROM qa_reports q
    JOIN users f ON f.id = q.qa_user_id
    WHERE q.manager_id = ?
    ORDER BY CASE q.status WHEN 'open' THEN 0 ELSE 1 END,
      CASE q.status WHEN 'open' THEN q.created_at END ASC,
      q.resolved_at DESC
  `).all(session.userId);

  return <ManagerQaReports reports={withQaDue(rows)} resolveAction={resolveReport} resolveDays={QA_RESOLVE_DAYS} />;
}
