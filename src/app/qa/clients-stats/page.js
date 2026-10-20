import { getDb } from '@/lib/db';
import { withQaDue } from '@/lib/qaReports';
import ClientsStatsClient from './ClientsStatsClient';

export const revalidate = 0;

export default async function QaClientsStatsPage() {
  const db = await getDb();

  // The full SEO client roster (the same `clients` table the SEO managers'
  // EODs are written against) — distinct names, since the same client exists
  // as one row per campaign.
  const clientRows = await db.prepare(`
    SELECT DISTINCT TRIM(name) as name FROM clients
    WHERE name IS NOT NULL AND TRIM(name) != ''
    ORDER BY name
  `).all();

  // Issues QA raised on a client = reports flagged from EOD entries, plus
  // manual (Executives) reports, which now name a client. Older manual
  // reports were filed under a free-text title instead (title IS NOT NULL) —
  // those aren't tied to a client, so they're left out. Task reports never are.
  const rows = await db.prepare(`
    SELECT q.id, q.source, q.severity, q.status, q.created_at, q.resolved_at, q.resolution_note,
      q.report_date, q.web_client_name, q.page_url, q.work_done, q.note,
      q.location, q.issue, q.department,
      q.manager_id, m.name as manager_name, f.name as filed_by
    FROM qa_reports q
    JOIN users m ON m.id = q.manager_id
    JOIN users f ON f.id = q.qa_user_id
    WHERE q.source = 'eod' OR (q.source = 'manual' AND q.title IS NULL AND q.web_client_name != '')
    ORDER BY q.created_at DESC
  `).all();

  const today = new Date().toISOString().split('T')[0];

  return <ClientsStatsClient reports={withQaDue(rows)} clients={clientRows.map((c) => c.name)} today={today} />;
}
