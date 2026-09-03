import { getDb } from '@/lib/db';
import Link from 'next/link';

export const revalidate = 0;

const BRAND_COLOR = '#16b293';

const STATUS_COLORS = {
  active: 'var(--success)',
  completed: 'var(--text-muted)',
};

/**
 * Read-only report for one specific Web SEO campaign (past or present) — client
 * breakdown and the associates progress table, scoped to that campaign
 * specifically instead of always the currently-active one. Reachable from
 * /admin/web-clients by clicking any campaign in its history list, regardless of
 * status — this is how a completed Web SEO campaign's real numbers stay viewable.
 * Mirrors /admin/campaign/[id] (the SEO campaign's equivalent report).
 */
export default async function WebSeoCampaignDetailPage({ params }) {
  const { id } = await params;
  const db = await getDb();
  const campaignId = parseInt(id, 10);

  const campaign = await db.prepare('SELECT * FROM webseo_campaigns WHERE id = ?').get(campaignId);

  if (!campaign) {
    return (
      <div className="card">
        <p style={{ color: 'var(--danger)', margin: 0 }}>Web SEO campaign not found.</p>
        <Link href="/admin/web-clients" style={{ color: 'var(--primary)', fontSize: '0.875rem' }}>← Back to Web Clients</Link>
      </div>
    );
  }

  const clientStats = await db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as removed,
      SUM(CASE WHEN is_active = 1 AND assigned_associate_id IS NOT NULL THEN 1 ELSE 0 END) as assigned
    FROM web_clients WHERE webseo_campaign_id = ?
  `).get(campaignId);

  const associates = await db.prepare(`
    SELECT u.id, u.name, u.email, u.lifetime_completed_links,
      (SELECT COUNT(DISTINCT client_id) FROM webseo_tasks WHERE associate_id = u.id AND webseo_campaign_id = ?) as assigned_clients,
      (SELECT SUM(target_count) FROM webseo_tasks WHERE associate_id = u.id AND webseo_campaign_id = ? AND post_type = 'guestpost') as guestpost_target,
      (SELECT SUM(completed_count) FROM webseo_tasks WHERE associate_id = u.id AND webseo_campaign_id = ? AND post_type = 'guestpost') as guestpost_completed,
      (SELECT SUM(target_count) FROM webseo_tasks WHERE associate_id = u.id AND webseo_campaign_id = ? AND post_type = 'web2') as web2_target,
      (SELECT SUM(completed_count) FROM webseo_tasks WHERE associate_id = u.id AND webseo_campaign_id = ? AND post_type = 'web2') as web2_completed
    FROM users u
    WHERE u.role = 'web_seo_associate' OR u.role = 'webseo'
    ORDER BY u.name
  `).all(campaignId, campaignId, campaignId, campaignId, campaignId);

  const campaignStats = await db.prepare(`
    SELECT COUNT(DISTINCT associate_id) as total_associates, SUM(target_count) as total_target, SUM(completed_count) as total_completed
    FROM webseo_tasks WHERE webseo_campaign_id = ?
  `).get(campaignId);

  const percent = campaignStats.total_target > 0 ? Math.round((campaignStats.total_completed / campaignStats.total_target) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <Link href="/admin/web-clients" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.875rem' }}>
          ← Back to Web Clients
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
          Started {campaign.start_date} — {campaign.total_days} day cycle
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
        <StatCard title="Total Web Clients" value={clientStats.total || 0} color={BRAND_COLOR} />
        <StatCard title="Active" value={clientStats.active || 0} color="var(--success)" />
        <StatCard title="Assigned" value={clientStats.assigned || 0} color="var(--primary)" />
        <StatCard title="Removed (from sheet)" value={clientStats.removed || 0} color="var(--text-muted)" />
        <StatCard title="Web SEO Associates" value={campaignStats.total_associates || 0} color={BRAND_COLOR} />
        <StatCard title="Posts" value={`${campaignStats.total_completed || 0} / ${campaignStats.total_target || 0}`} sub={`${percent}% complete`} color="var(--success)" />
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Web SEO Associates</h2>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{associates.length} total</span>
        </div>
        {associates.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>No Web SEO Associates.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Clients</th>
                  <th style={thStyle}>Guest Posts</th>
                  <th style={thStyle}>Web 2.0 Posts</th>
                  <th style={thStyle}>Progress</th>
                  <th style={thStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {associates.map(a => {
                  const total = (a.guestpost_target || 0) + (a.web2_target || 0);
                  const completed = (a.guestpost_completed || 0) + (a.web2_completed || 0);
                  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                  return (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={tdStyle}>{a.name}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{a.email}</td>
                      <td style={{ ...tdStyle, fontWeight: '600', color: 'var(--primary)' }}>{a.assigned_clients || 0}</td>
                      <td style={tdStyle}>{a.guestpost_completed || 0} / {a.guestpost_target || 0}</td>
                      <td style={tdStyle}>{a.web2_completed || 0} / {a.web2_target || 0}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: '80px', height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', backgroundColor: 'var(--primary)' }}></div>
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{pct}%</span>
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <Link href={`/admin/web-clients/campaigns/${campaign.id}/associates/${a.id}`} style={viewLinkStyle}>
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const thStyle = { padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' };
const tdStyle = { padding: '0.75rem 1rem 0.75rem 0', whiteSpace: 'nowrap' };
const viewLinkStyle = {
  padding: '0.4rem 0.75rem',
  backgroundColor: 'var(--primary)',
  color: 'white',
  textDecoration: 'none',
  borderRadius: '0.25rem',
  fontSize: '0.75rem',
  fontWeight: '500',
  display: 'inline-block',
};

function StatCard({ title, value, sub, color }) {
  return (
    <div className="card" style={{ borderLeft: `4px solid ${color}` }}>
      <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>{title}</h3>
      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  );
}
