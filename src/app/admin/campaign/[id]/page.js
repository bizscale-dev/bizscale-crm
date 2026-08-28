import { getDb } from '@/lib/db';
import Link from 'next/link';
import SeoAssociatesTable from '@/components/team-progress/SeoAssociatesTable';

export const revalidate = 0;

const BRAND_COLOR = '#16b293';

const STATUS_COLORS = {
  active: 'var(--success)',
  paused: '#f59e0b',
  completed: 'var(--text-muted)',
};

/**
 * Read-only report for one specific campaign (past or present) — client
 * breakdown and the same SEO Associates progress table shown elsewhere, just
 * scoped to this campaign instead of always the currently-active one. Reachable
 * from /admin/campaign by clicking any campaign in the list, regardless of its
 * status — this is how a completed campaign's real numbers stay viewable.
 */
export default async function CampaignDetailPage({ params }) {
  const { id } = await params;
  const db = await getDb();
  const campaignId = parseInt(id, 10);

  const campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);

  if (!campaign) {
    return (
      <div className="card">
        <p style={{ color: 'var(--danger)', margin: 0 }}>Campaign not found.</p>
      </div>
    );
  }

  const clientStats = await db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_active = 1 AND (tunnel_status IS NULL OR tunnel_status NOT IN ('active', 'hold')) THEN 1 ELSE 0 END) as regular,
      SUM(CASE WHEN is_active = 1 AND tunnel_status = 'active' AND funnel_month = 1 THEN 1 ELSE 0 END) as m1,
      SUM(CASE WHEN is_active = 1 AND tunnel_status = 'active' AND funnel_month = 2 THEN 1 ELSE 0 END) as m2,
      SUM(CASE WHEN is_active = 1 AND tunnel_status = 'active' AND funnel_month = 3 THEN 1 ELSE 0 END) as m3,
      SUM(CASE WHEN is_active = 1 AND tunnel_status = 'hold' THEN 1 ELSE 0 END) as held,
      SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as deactivated
    FROM clients WHERE campaign_id = ?
  `).get(campaignId);

  const seoStats = await db.prepare(`
    SELECT COALESCE(SUM(target_count), 0) as target, COALESCE(SUM(completed_count), 0) as completed
    FROM seo_tasks WHERE campaign_id = ?
  `).get(campaignId);

  const associateCount = (await db.prepare(`
    SELECT COUNT(DISTINCT aa.user_id) as c FROM associate_assignments aa WHERE aa.campaign_id = ?
  `).get(campaignId)).c || 0;

  const seoPercent = seoStats.target > 0 ? Math.round((seoStats.completed / seoStats.target) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <Link href="/admin/campaign" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.875rem' }}>
          ← Back to Campaigns
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', margin: 0 }}>{campaign.name}</h1>
          <span style={{
            padding: '0.4rem 0.75rem',
            backgroundColor: 'var(--card-bg)',
            border: `1px solid ${STATUS_COLORS[campaign.status] || 'var(--border)'}`,
            color: STATUS_COLORS[campaign.status] || 'var(--text-muted)',
            borderRadius: '0.25rem',
            fontSize: '0.75rem',
            fontWeight: '600',
            textTransform: 'capitalize',
          }}>
            {campaign.status}
          </span>
        </div>
        <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>
          {campaign.start_date ? `Started ${campaign.start_date}` : 'No start date set'} — {campaign.total_days} day cycle
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
        <StatCard title="Total Clients" value={clientStats.total || 0} color={BRAND_COLOR} />
        <StatCard title="Regular Clients" value={clientStats.regular || 0} color="var(--success)" />
        <StatCard title="Funnel Clients" value={(clientStats.m1 || 0) + (clientStats.m2 || 0) + (clientStats.m3 || 0)} sub={`M1: ${clientStats.m1 || 0} · M2: ${clientStats.m2 || 0} · M3: ${clientStats.m3 || 0}`} color="var(--primary)" />
        <StatCard title="On Hold" value={clientStats.held || 0} color="#f59e0b" />
        <StatCard title="Deactivated" value={clientStats.deactivated || 0} color="var(--text-muted)" />
        <StatCard title="SEO Associates" value={associateCount} color={BRAND_COLOR} />
        <StatCard title="SEO Links" value={`${seoStats.completed} / ${seoStats.target}`} sub={`${seoPercent}% complete`} color="var(--success)" />
      </div>

      <SeoAssociatesTable campaign={campaign} />
    </div>
  );
}

function StatCard({ title, value, sub, color }) {
  return (
    <div className="card" style={{ borderLeft: `4px solid ${color}` }}>
      <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>{title}</h3>
      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  );
}
