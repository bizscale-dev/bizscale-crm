import { getDb } from '@/lib/db';
import Link from 'next/link';

export const revalidate = 0;

const BRAND_COLOR = '#16b293';

const STATUS_COLORS = {
  active: 'var(--success)',
  completed: 'var(--text-muted)',
};

/**
 * Read-only report for one specific Writer campaign (past or present) — writer
 * breakdown and GBP-Off/Web-Off progress, scoped to that campaign specifically
 * instead of always the currently-active one. Reachable from /admin/writers by
 * clicking any campaign in its history list, regardless of status — this is how
 * a completed writer campaign's real numbers stay viewable. Mirrors
 * /admin/campaign/[id] (the SEO campaign's equivalent report).
 */
export default async function WriterCampaignDetailPage({ params }) {
  const { id } = await params;
  const db = await getDb();
  const campaignId = parseInt(id, 10);

  const campaign = await db.prepare('SELECT * FROM writer_campaigns WHERE id = ?').get(campaignId);

  if (!campaign) {
    return (
      <div className="card">
        <p style={{ color: 'var(--danger)', margin: 0 }}>Writer campaign not found.</p>
        <Link href="/admin/writers" style={{ color: 'var(--primary)', fontSize: '0.875rem' }}>← Back to Writers</Link>
      </div>
    );
  }

  const name = campaign.name || `Writer Campaign #${campaign.id}`;

  const writersDashboard = await db.prepare(`
    SELECT u.id, u.name, u.email, u.is_active,
      (SELECT COUNT(*) FROM writer_offpage_assignments WHERE writer_id = u.id AND writer_campaign_id = ? AND task_type = 'gbp') as gbp_assigned_clients,
      (SELECT SUM(target_count) FROM writer_offpage_tasks WHERE writer_id = u.id AND writer_campaign_id = ? AND task_type = 'gbp') as gbp_target,
      (SELECT SUM(completed_count) FROM writer_offpage_tasks WHERE writer_id = u.id AND writer_campaign_id = ? AND task_type = 'gbp') as gbp_completed,
      (SELECT COUNT(*) FROM writer_offpage_assignments WHERE writer_id = u.id AND writer_campaign_id = ? AND task_type = 'weboff') as weboff_assigned_clients,
      (SELECT SUM(target_count) FROM writer_offpage_tasks WHERE writer_id = u.id AND writer_campaign_id = ? AND task_type = 'weboff') as weboff_target,
      (SELECT SUM(completed_count) FROM writer_offpage_tasks WHERE writer_id = u.id AND writer_campaign_id = ? AND task_type = 'weboff') as weboff_completed
    FROM users u
    WHERE u.role = 'writer'
    ORDER BY u.name
  `).all(campaignId, campaignId, campaignId, campaignId, campaignId, campaignId);

  const gbpStats = await db.prepare(`
    SELECT SUM(target_count) as target, SUM(completed_count) as completed
    FROM writer_offpage_tasks WHERE writer_campaign_id = ? AND task_type = 'gbp'
  `).get(campaignId);

  const weboffStats = await db.prepare(`
    SELECT SUM(target_count) as target, SUM(completed_count) as completed
    FROM writer_offpage_tasks WHERE writer_campaign_id = ? AND task_type = 'weboff'
  `).get(campaignId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <Link href="/admin/writers" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.875rem' }}>
          ← Back to Writers
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', margin: 0 }}>{name}</h1>
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
        <StatCard title="Active Writers" value={writersDashboard.filter(w => w.is_active).length} color={BRAND_COLOR} />
        <StatCard title="GBP-Off Completed" value={`${gbpStats.completed || 0} / ${gbpStats.target || 0}`} color="var(--primary)" />
        <StatCard title="Web-Off Completed" value={`${weboffStats.completed || 0} / ${weboffStats.target || 0}`} color="var(--success)" />
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Writers</h2>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{writersDashboard.length} total</span>
        </div>
        {writersDashboard.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>No writers found.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>GBP Clients</th>
                  <th style={thStyle}>GBP Progress</th>
                  <th style={thStyle}>Web-Off Clients</th>
                  <th style={thStyle}>Web-Off Progress</th>
                </tr>
              </thead>
              <tbody>
                {writersDashboard.map(w => {
                  const gbpPct = w.gbp_target > 0 ? Math.round((w.gbp_completed / w.gbp_target) * 100) : 0;
                  const weboffPct = w.weboff_target > 0 ? Math.round((w.weboff_completed / w.weboff_target) * 100) : 0;
                  return (
                    <tr key={w.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={tdStyle}>{w.name}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{w.email}</td>
                      <td style={{ ...tdStyle, fontWeight: '600', color: 'var(--primary)' }}>{w.gbp_assigned_clients || 0}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: '80px', height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: `${gbpPct}%`, height: '100%', backgroundColor: 'var(--primary)' }}></div>
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{w.gbp_completed || 0}/{w.gbp_target || 0} ({gbpPct}%)</span>
                        </div>
                      </td>
                      <td style={{ ...tdStyle, fontWeight: '600', color: 'var(--success)' }}>{w.weboff_assigned_clients || 0}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: '80px', height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: `${weboffPct}%`, height: '100%', backgroundColor: 'var(--success)' }}></div>
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{w.weboff_completed || 0}/{w.weboff_target || 0} ({weboffPct}%)</span>
                        </div>
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

function StatCard({ title, value, color }) {
  return (
    <div className="card" style={{ borderLeft: `4px solid ${color}` }}>
      <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>{title}</h3>
      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--foreground)' }}>{value}</div>
    </div>
  );
}
