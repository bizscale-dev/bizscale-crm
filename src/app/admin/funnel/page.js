import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import { LINK_TYPES, LINK_TYPE_LABELS } from '@/lib/linkTargetConstants';
import FunnelTemplatesClient from './FunnelTemplatesClient';
import FunnelSettingsClient from './FunnelSettingsClient';
import FunnelClientsTable from './FunnelClientsTable';
import FunnelHoldClientsTable from './FunnelHoldClientsTable';

export const revalidate = 0;

export default async function FunnelPage() {
  const db = await getDb();
  const campaign = await getActiveCampaign();

  let funnelClients = [];
  let funnelStats = null;
  let existingTemplates = [];
  let holdClients = [];

  if (campaign) {
    // All 3 funnel months are now tracked through seo_tasks (see taskService.js's
    // generateSEOTasks) — Month 1 uses its fixed 4-week schedule (manually advanced
    // week by week — see funnel_month1_start_week/current_week), Month 2/3 use the
    // Month 2 & 3 Bonus Link Targets, all day-distributed and Google Sheet-synced.
    funnelClients = await db.prepare(`
      SELECT c.id, c.name, c.website, c.tunnel_start_date, c.funnel_month, c.assigned_associate_id,
        c.funnel_month1_start_week, c.funnel_month1_current_week,
        (SELECT COALESCE(SUM(completed_count), 0) FROM seo_tasks WHERE client_id = c.id AND campaign_id = c.campaign_id) as completed_tasks,
        (SELECT COALESCE(SUM(target_count), 0) FROM seo_tasks WHERE client_id = c.id AND campaign_id = c.campaign_id) as total_tasks
      FROM clients c
      WHERE c.campaign_id = ? AND c.tunnel_status = 'active' AND c.is_active = 1
      ORDER BY c.tunnel_start_date DESC
    `).all(campaign.id);

    // Newly-discovered clients sit here — zero tasks, awaiting a manual decision
    // (see src/lib/funnel.js) — instead of auto-enrolling into the Funnel.
    holdClients = await db.prepare(`
      SELECT id, name, website, assigned_associate_id
      FROM clients
      WHERE campaign_id = ? AND tunnel_status = 'hold' AND is_active = 1
      ORDER BY id DESC
    `).all(campaign.id);

    const funnelSeoStats = await db.prepare(`
      SELECT
        COUNT(DISTINCT c.id) as active_clients,
        COALESCE(SUM(st.target_count), 0) as total_tasks,
        COALESCE(SUM(st.completed_count), 0) as completed_tasks
      FROM seo_tasks st
      JOIN clients c ON c.id = st.client_id
      WHERE st.campaign_id = ? AND c.tunnel_status = 'active' AND c.is_active = 1
        AND c.funnel_month IN (1, 2, 3)
    `).get(campaign.id);

    const totalTasks = funnelSeoStats.total_tasks || 0;
    const completedTasks = funnelSeoStats.completed_tasks || 0;
    funnelStats = {
      active_clients: funnelSeoStats.active_clients || 0,
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      pending_tasks: totalTasks - completedTasks,
    };

    existingTemplates = await db.prepare(`
      SELECT * FROM tunnel_templates WHERE campaign_id = ? AND week_number IN (1, 2, 3, 4)
      ORDER BY week_number, category, order_in_week
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
              New clients land on hold with zero tasks until manually placed. Once placed, a client onboards
              through a 3-month program, tracked day-by-day and Google Sheet-synced the same way as a normal
              client. Month 1 runs a fixed 4-week schedule (citations, profiles, image and PDF submissions each
              week, Web 2.0 on the single last day) — advanced one week at a time, manually. Months 2 &amp; 3 use
              the campaign&apos;s Month 2 &amp; 3 Bonus Link Targets as that month&apos;s target. Every
              advance — week, month, or graduation to the main campaign — is a manual action here, not automatic.
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

          <div className="card" style={{ border: '1px solid #f59e0b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.25rem', margin: 0, color: '#f59e0b' }}>On Hold</h2>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{holdClients.length} awaiting placement</span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 1.5rem 0' }}>
              Newly-discovered clients land here with zero tasks instead of auto-joining the Funnel. Place each
              one into Funnel Month 1 (optionally starting past week 1, if some of their work already happened
              outside the system) whenever you&apos;re ready.
            </p>
            <FunnelHoldClientsTable holdClients={holdClients} campaignId={campaign.id} />
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
