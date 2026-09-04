import { getDb } from '@/lib/db';
import { getActiveWebSeoCampaign } from '@/lib/services';
import Link from 'next/link';

export const revalidate = 0;

export default async function WebSEOAssociatesPage() {
  const db = await getDb();
  const campaign = await getActiveWebSeoCampaign();

  let webSeoAssociates = [];
  let webSeoStats = [];
  let campaignStats = null;

  if (campaign) {
    // Get all active users that could be Web SEO Associates (we'll create this role)
    webSeoAssociates = await db.prepare(`
      SELECT u.id, u.name, u.email, u.is_active, u.role
      FROM users u
      WHERE u.role = 'web_seo_associate' OR u.role = 'webseo'
      ORDER BY u.name
    `).all();

    // Get Web SEO stats for each associate
    webSeoStats = await db.prepare(`
      SELECT u.id, u.name, u.lifetime_completed_links,
        (SELECT COUNT(DISTINCT client_id) FROM webseo_tasks WHERE associate_id = u.id AND webseo_campaign_id = ?) as assigned_clients,
        (SELECT COUNT(DISTINCT day_number) FROM webseo_tasks WHERE associate_id = u.id AND webseo_campaign_id = ?) as scheduled_days,
        (SELECT SUM(target_count) FROM webseo_tasks WHERE associate_id = u.id AND webseo_campaign_id = ? AND post_type = 'guestpost') as guestpost_target,
        (SELECT SUM(completed_count) FROM webseo_tasks WHERE associate_id = u.id AND webseo_campaign_id = ? AND post_type = 'guestpost') as guestpost_completed,
        (SELECT SUM(target_count) FROM webseo_tasks WHERE associate_id = u.id AND webseo_campaign_id = ? AND post_type = 'web2') as web2_target,
        (SELECT SUM(completed_count) FROM webseo_tasks WHERE associate_id = u.id AND webseo_campaign_id = ? AND post_type = 'web2') as web2_completed
      FROM users u
      WHERE u.role = 'web_seo_associate' OR u.role = 'webseo'
      ORDER BY u.name
    `).all(campaign.id, campaign.id, campaign.id, campaign.id, campaign.id, campaign.id);

    // Campaign-level stats
    campaignStats = await db.prepare(`
      SELECT
        COUNT(DISTINCT associate_id) as total_associates,
        COUNT(DISTINCT client_id) as total_clients,
        SUM(target_count) as total_target_posts,
        SUM(completed_count) as total_completed_posts,
        SUM(CASE WHEN post_type = 'guestpost' THEN target_count ELSE 0 END) as guestpost_target,
        SUM(CASE WHEN post_type = 'guestpost' THEN completed_count ELSE 0 END) as guestpost_completed,
        SUM(CASE WHEN post_type = 'web2' THEN target_count ELSE 0 END) as web2_target,
        SUM(CASE WHEN post_type = 'web2' THEN completed_count ELSE 0 END) as web2_completed
      FROM webseo_tasks
      WHERE webseo_campaign_id = ?
    `).get(campaign.id);
  }

  const BRAND_COLOR = '#16b293';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {!campaign ? (
        <div className="card">
          <h3>No Active Web SEO Campaign</h3>
          <p style={{ color: 'var(--text-muted)' }}>Start one from Admin → Web Clients to manage Web SEO Associates.</p>
        </div>
      ) : (
        <>
          {/* Page Header */}
          <div>
            <h1 style={{ fontSize: '1.75rem', margin: 0, marginBottom: '0.5rem' }}>Web SEO Associates</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
              Manage Web SEO Associates and their guest post and web 2.0 tasks
            </p>
          </div>

          {/* Stats Overview */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <div className="card" style={{ borderLeft: `4px solid ${BRAND_COLOR}` }}>
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Active Associates
              </h3>
              <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>
                {campaignStats?.total_associates || 0}
              </div>
            </div>
            <div className="card" style={{ borderLeft: `4px solid ${BRAND_COLOR}` }}>
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Total Target Posts
              </h3>
              <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>
                {campaignStats?.total_target_posts || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {campaignStats?.total_completed_posts || 0} completed
              </div>
            </div>
            <div className="card" style={{ borderLeft: `4px solid ${BRAND_COLOR}` }}>
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Guest Posts Target
              </h3>
              <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>
                {campaignStats?.guestpost_target || 0}
              </div>
            </div>
            <div className="card" style={{ borderLeft: `4px solid ${BRAND_COLOR}` }}>
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Web 2.0 Target
              </h3>
              <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>
                {campaignStats?.web2_target || 0}
              </div>
            </div>
          </div>

          {/* Web SEO Associates Table */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Web SEO Associates Dashboard</h2>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{webSeoAssociates.length} total</span>
            </div>

            {webSeoAssociates.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>No Web SEO Associates assigned yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' }}>Name</th>
                      <th style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' }}>Email</th>
                      <th style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' }}>Status</th>
                      <th style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' }}>Clients</th>
                      <th style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' }}>Guest Posts</th>
                      <th style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' }}>Web 2.0 Posts</th>
                      <th style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' }}>Total Progress</th>
                      <th style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' }}>All-Time (Sheet)</th>
                      <th style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {webSeoStats.map((associate) => {
                      const totalTarget = (associate.guestpost_target || 0) + (associate.web2_target || 0);
                      // webseo_tasks rows get wiped and rebuilt from scratch on every client
                      // sync (see webSeoTaskGenerator.js), so guestpost/web2_completed only
                      // reflect the current rotation cycle, not real history.
                      // lifetime_completed_links is a running total from the sheet that's
                      // never reset — use that for overall progress (same number shown in
                      // All-Time (Sheet)) instead.
                      const progressPercent = totalTarget > 0 ? Math.round(((associate.lifetime_completed_links || 0) / totalTarget) * 100) : 0;

                      return (
                        <tr key={associate.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.75rem 1rem 0.75rem 0', fontWeight: '500', whiteSpace: 'nowrap' }}>{associate.name}</td>
                          <td style={{ padding: '0.75rem 1rem 0.75rem 0', color: 'var(--text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{associate.email}</td>
                          <td style={{ padding: '0.75rem 1rem 0.75rem 0', whiteSpace: 'nowrap' }}>
                            <span style={{
                              padding: '0.25rem 0.5rem',
                              backgroundColor: 'rgba(34, 197, 94, 0.1)',
                              color: 'var(--success)',
                              borderRadius: '0.25rem',
                              fontSize: '0.75rem',
                              fontWeight: '500'
                            }}>
                              active
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem 0.75rem 0', fontWeight: '600', color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                            {associate.assigned_clients || 0}
                          </td>
                          <td style={{ padding: '0.75rem 1rem 0.75rem 0', whiteSpace: 'nowrap' }}>
                            <span style={{ fontWeight: '600', color: 'var(--success)' }}>
                              {associate.guestpost_completed || 0}
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}> / {associate.guestpost_target || 0}</span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem 0.75rem 0', whiteSpace: 'nowrap' }}>
                            <span style={{ fontWeight: '600', color: 'var(--success)' }}>
                              {associate.web2_completed || 0}
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}> / {associate.web2_target || 0}</span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem 0.75rem 0', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{ width: '80px', height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ width: `${progressPercent}%`, height: '100%', backgroundColor: 'var(--primary)' }}></div>
                              </div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{progressPercent}%</span>
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem 0.75rem 0', fontWeight: '600', color: 'var(--success)', whiteSpace: 'nowrap' }}>
                            {associate.lifetime_completed_links || 0}
                          </td>
                          <td style={{ padding: '0.75rem 0', whiteSpace: 'nowrap' }}>
                            <Link href={`/admin/web-seo-associates/${associate.id}`} style={{
                              padding: '0.4rem 0.75rem',
                              backgroundColor: 'var(--primary)',
                              color: 'white',
                              textDecoration: 'none',
                              borderRadius: '0.25rem',
                              fontSize: '0.75rem',
                              fontWeight: '500',
                              display: 'inline-block'
                            }}>
                              View Dashboard
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
        </>
      )}
    </div>
  );
}
