import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import { LINK_TYPES, LINK_TYPE_LABELS } from '@/lib/linkTargetConstants';
import FunnelTemplatesClient from './FunnelTemplatesClient';
import FunnelSettingsClient from './FunnelSettingsClient';
import FunnelClientsTable from './FunnelClientsTable';

export const revalidate = 0;

export default async function FunnelPage() {
  const db = await getDb();
  const campaign = await getActiveCampaign();

  let funnelClients = [];
  let funnelStats = null;
  let existingTemplates = [];

  if (campaign) {
    // Month 1 is a fixed checklist tracked in tunnel_tasks; Month 2/3 clients are
    // tracked through seo_tasks instead (see taskService.js's generateSEOTasks) —
    // their seo_tasks rows are entirely the Month 2/3 Bonus Link Targets, nothing
    // else, so this reads as just that month's real task count, not mixed with
    // any "normal" client total.
    funnelClients = await db.prepare(`
      SELECT c.id, c.name, c.website, c.tunnel_start_date, c.funnel_month, c.assigned_associate_id,
        CASE WHEN c.funnel_month = 1
          THEN (SELECT COUNT(*) FROM tunnel_tasks WHERE client_id = c.id AND funnel_month = 1 AND status = 'completed')
          ELSE (SELECT COALESCE(SUM(completed_count), 0) FROM seo_tasks WHERE client_id = c.id AND campaign_id = c.campaign_id)
        END as completed_tasks,
        CASE WHEN c.funnel_month = 1
          THEN (SELECT COUNT(*) FROM tunnel_tasks WHERE client_id = c.id AND funnel_month = 1)
          ELSE (SELECT COALESCE(SUM(target_count), 0) FROM seo_tasks WHERE client_id = c.id AND campaign_id = c.campaign_id)
        END as total_tasks
      FROM clients c
      WHERE c.campaign_id = ? AND c.tunnel_status = 'active' AND c.is_active = 1
      ORDER BY c.tunnel_start_date DESC
    `).all(campaign.id);

    // Combine Month 1 (tunnel_tasks) and Month 2/3 (seo_tasks) stats into one
    // summary. Only counts clients/tasks still active in the funnel.
    const month1Stats = await db.prepare(`
      SELECT
        COUNT(DISTINCT tt.client_id) as active_clients,
        COUNT(*) as total_tasks,
        SUM(CASE WHEN tt.status = 'completed' THEN 1 ELSE 0 END) as completed_tasks
      FROM tunnel_tasks tt
      JOIN clients c ON c.id = tt.client_id
      WHERE tt.campaign_id = ? AND c.tunnel_status = 'active' AND c.is_active = 1
        AND c.funnel_month = 1 AND tt.funnel_month = 1
    `).get(campaign.id);

    const bonusMonthStats = await db.prepare(`
      SELECT
        COUNT(DISTINCT c.id) as active_clients,
        COALESCE(SUM(st.target_count), 0) as total_tasks,
        COALESCE(SUM(st.completed_count), 0) as completed_tasks
      FROM seo_tasks st
      JOIN clients c ON c.id = st.client_id
      WHERE st.campaign_id = ? AND c.tunnel_status = 'active' AND c.is_active = 1
        AND c.funnel_month IN (2, 3)
    `).get(campaign.id);

    const totalTasks = (month1Stats.total_tasks || 0) + (bonusMonthStats.total_tasks || 0);
    const completedTasks = (month1Stats.completed_tasks || 0) + (bonusMonthStats.completed_tasks || 0);
    funnelStats = {
      active_clients: (month1Stats.active_clients || 0) + (bonusMonthStats.active_clients || 0),
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      pending_tasks: totalTasks - completedTasks,
    };

    existingTemplates = await db.prepare(`
      SELECT * FROM tunnel_templates WHERE campaign_id = ? AND week_number = 0
      ORDER BY category, order_in_week
    `).all(campaign.id);
  }

  const BRAND_COLOR = '#16b293';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {!campaign ? (
        <div className="card">
          <h3>No Active Campaign</h3>
          <p style={{ color: 'var(--text-muted)' }}>Please activate a campaign to manage the Funnel.</p>
        </div>
      ) : (
        <>
          <div>
            <h1 style={{ fontSize: '1.75rem', margin: 0, marginBottom: '0.5rem' }}>Funnel</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
              New clients onboard through a 3-month program: Month 1 is a fixed 44-item citation/profile/content
              checklist. Months 2 &amp; 3 use the campaign&apos;s Month 2 &amp; 3 Bonus Link Targets as that
              month&apos;s target, tracked day-by-day through the same Google Sheet-synced pipeline as a normal
              client (not the fixed checklist). Clients advance automatically each day and graduate to the main
              campaign after Month 3.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
            <div className="card" style={{ borderLeft: `4px solid ${BRAND_COLOR}` }}>
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Active Funnel Clients
              </h3>
              <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>
                {funnelStats?.active_clients || 0}
              </div>
            </div>
            <div className="card" style={{ borderLeft: `4px solid ${BRAND_COLOR}` }}>
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Total Funnel Tasks
              </h3>
              <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>
                {funnelStats?.total_tasks || 0}
              </div>
            </div>
            <div className="card" style={{ borderLeft: `4px solid ${BRAND_COLOR}` }}>
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Completed
              </h3>
              <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>
                {funnelStats?.completed_tasks || 0} / {funnelStats?.total_tasks || 0}
              </div>
            </div>
            <div className="card" style={{ borderLeft: `4px solid ${BRAND_COLOR}` }}>
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Pending Tasks
              </h3>
              <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>
                {funnelStats?.pending_tasks || 0}
              </div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Funnel Clients</h2>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{funnelClients.length} active</span>
            </div>

            <FunnelClientsTable funnelClients={funnelClients} />
          </div>

          <FunnelSettingsClient campaign={campaign} linkTypes={LINK_TYPES} linkTypeLabels={LINK_TYPE_LABELS} />

          <FunnelTemplatesClient campaign={campaign} existingTemplates={existingTemplates} />
        </>
      )}
    </div>
  );
}
