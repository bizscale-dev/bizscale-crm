import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import EodReportClient from './EodReportClient';

export const revalidate = 0;

export default async function SeoManagerEodPage() {
  const db = await getDb();
  const session = await verifySession();

  // EOD reporting is deliberately independent of any campaign — managers file a report
  // every day regardless of whether a campaign is active, paused, or completed. Every
  // active SEO client (the same roster imported from the Google Sheet on
  // /admin/clients), not scoped to whichever campaign happens to be active right now.
  const clients = await db.prepare(`
    SELECT id, name, website
    FROM clients
    WHERE is_active = 1
    ORDER BY name
  `).all();

  // This manager's own previously submitted reports, newest first.
  const reports = await db.prepare(`
    SELECT id, report_date, created_at
    FROM eod_reports
    WHERE user_id = ?
    ORDER BY report_date DESC
    LIMIT 30
  `).all(session.userId);

  const history = await Promise.all(reports.map(async report => ({
    ...report,
    entries: await db.prepare(`
      SELECT id, web_client_name, page_url, work_done, description
      FROM eod_report_entries
      WHERE report_id = ?
      ORDER BY id
    `).all(report.id),
  })));

  const today = new Date().toISOString().split('T')[0];

  return (
    <EodReportClient
      webClients={clients.map(c => ({ id: c.id, label: c.name }))}
      history={history}
      today={today}
    />
  );
}
