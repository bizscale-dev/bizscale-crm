import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import { verifySession } from '@/lib/session';
import EodReportClient from './EodReportClient';

export const revalidate = 0;

export default async function WebSeoManagerEodPage() {
  const db = await getDb();
  const session = await verifySession();
  const campaign = await getActiveCampaign();

  // Every active web client on the active campaign — the same scope the admin's Web
  // Clients page lists, so the dropdown matches what the manager sees elsewhere.
  let webClients = [];
  if (campaign) {
    webClients = await db.prepare(`
      SELECT id, business_name, name
      FROM web_clients
      WHERE campaign_id = ? AND is_active = 1
      ORDER BY business_name, name
    `).all(campaign.id);
  }

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
      webClients={webClients.map(c => ({ id: c.id, label: c.business_name || c.name }))}
      history={history}
      today={today}
      hasCampaign={!!campaign}
    />
  );
}
