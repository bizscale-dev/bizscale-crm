import { getDb } from '@/lib/db';
import { getActiveCampaign, LINK_TYPE_LABELS } from '@/lib/services';

export default async function ReportsPage() {
  const db = await getDb();
  const campaign = await getActiveCampaign();

  let linkTypeBreakdown = [];
  let clientProgress = [];
  let recentLinks = [];
  let recentPosts = [];

  if (campaign) {
    linkTypeBreakdown = await db.prepare(`
      SELECT link_type, SUM(target_count) as target, SUM(completed_count) as completed
      FROM seo_tasks WHERE campaign_id = ?
      GROUP BY link_type
    `).all(campaign.id);

    clientProgress = await db.prepare(`
      SELECT c.name, c.website,
        SUM(st.target_count) as target,
        SUM(st.completed_count) as completed
      FROM seo_tasks st JOIN clients c ON c.id = st.client_id
      WHERE st.campaign_id = ?
      GROUP BY st.client_id
      ORDER BY completed DESC
    `).all(campaign.id);

    // Only fetch logs if the table exists (it might not have been created yet or has no data, but SQLite handles this fine if initialized)
    recentLinks = await db.prepare(`
      SELECT ll.*, u.name as user_name, c.name as client_name, st.link_type
      FROM link_logs ll
      JOIN seo_tasks st ON st.id = ll.task_id
      JOIN users u ON u.id = ll.logged_by
      JOIN clients c ON c.id = st.client_id
      WHERE st.campaign_id = ?
      ORDER BY ll.created_at DESC LIMIT 50
    `).all(campaign.id);

    recentPosts = await db.prepare(`
      SELECT wl.*, u.name as user_name, wt.post_type
      FROM writing_logs wl
      JOIN writing_tasks wt ON wt.id = wl.task_id
      JOIN users u ON u.id = wl.logged_by
      WHERE wt.campaign_id = ?
      ORDER BY wl.created_at DESC LIMIT 50
    `).all(campaign.id);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {!campaign ? (
        <div className="card">
          <p style={{ color: 'var(--danger)', margin: 0 }}>
            No active campaign found. You must activate a campaign to view reports.
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            
            <div className="card">
              <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                Links by Type
              </h2>
              {linkTypeBreakdown.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No tasks generated.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {linkTypeBreakdown.map(lt => {
                    const label = LINK_TYPE_LABELS[lt.link_type] || lt.link_type;
                    const percent = lt.target > 0 ? Math.round((lt.completed / lt.target) * 100) : 0;
                    return (
                      <div key={lt.link_type}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <span style={{ fontWeight: '500' }}>{label}</span>
                          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                            {lt.completed} / {lt.target} ({percent}%)
                          </span>
                        </div>
                        <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${percent}%`, height: '100%', backgroundColor: 'var(--primary)', transition: 'width 0.5s ease-out' }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card">
              <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                Client SEO Progress
              </h2>
              {clientProgress.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No tasks generated.</p>
              ) : (
                <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--card-bg)' }}>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '0.75rem 0' }}>Client</th>
                        <th style={{ padding: '0.75rem 0' }}>Completed / Target</th>
                        <th style={{ padding: '0.75rem 0' }}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientProgress.map(c => {
                        const percent = c.target > 0 ? Math.round((c.completed / c.target) * 100) : 0;
                        return (
                          <tr key={c.name} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '0.75rem 0', fontWeight: '500' }}>{c.name}</td>
                            <td style={{ padding: '0.75rem 0', color: 'var(--text-muted)' }}>{c.completed} / {c.target}</td>
                            <td style={{ padding: '0.75rem 0', color: percent >= 100 ? 'var(--success)' : 'var(--foreground)' }}>{percent}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              Recent SEO Links
            </h2>
            {recentLinks.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No links logged yet.</p>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--card-bg)' }}>
                    <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.75rem 0' }}>Date</th>
                      <th style={{ padding: '0.75rem 0' }}>Associate</th>
                      <th style={{ padding: '0.75rem 0' }}>Client</th>
                      <th style={{ padding: '0.75rem 0' }}>Type</th>
                      <th style={{ padding: '0.75rem 0' }}>URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLinks.map(ll => (
                      <tr key={ll.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem 0', color: 'var(--text-muted)' }}>{new Date(ll.created_at).toLocaleString()}</td>
                        <td style={{ padding: '0.75rem 0' }}>{ll.user_name}</td>
                        <td style={{ padding: '0.75rem 0', fontWeight: '500' }}>{ll.client_name}</td>
                        <td style={{ padding: '0.75rem 0' }}>{LINK_TYPE_LABELS[ll.link_type] || ll.link_type}</td>
                        <td style={{ padding: '0.75rem 0' }}>
                          <a href={ll.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                            {ll.url}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              Recent Writing Posts
            </h2>
            {recentPosts.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No posts logged yet.</p>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--card-bg)' }}>
                    <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.75rem 0' }}>Date</th>
                      <th style={{ padding: '0.75rem 0' }}>Writer</th>
                      <th style={{ padding: '0.75rem 0' }}>Type</th>
                      <th style={{ padding: '0.75rem 0' }}>URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPosts.map(wl => (
                      <tr key={wl.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem 0', color: 'var(--text-muted)' }}>{new Date(wl.created_at).toLocaleString()}</td>
                        <td style={{ padding: '0.75rem 0', fontWeight: '500' }}>{wl.user_name}</td>
                        <td style={{ padding: '0.75rem 0', textTransform: 'capitalize' }}>{wl.post_type}</td>
                        <td style={{ padding: '0.75rem 0' }}>
                          <a href={wl.post_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                            {wl.post_url}
                          </a>
                        </td>
                      </tr>
                    ))}
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
