import { getDb } from '@/lib/db';
import { getActiveWebSeoCampaign } from '@/lib/services';
import Link from 'next/link';

const POST_TYPE_LABELS = { guestpost: 'Guest Post', web2: 'Web 2.0' };

export default async function WebSeoAssociatesProgress({ basePath } = {}) {
  const db = await getDb();
  const campaign = await getActiveWebSeoCampaign();

  if (!campaign) {
    return <div className="card"><p style={{ color: 'var(--danger)', margin: 0 }}>No active campaign found.</p></div>;
  }

  const associates = await db.prepare(`
    SELECT u.id, u.name, u.email,
      SUM(wt.target_count) as total_target,
      SUM(wt.completed_count) as total_completed,
      (SELECT COUNT(DISTINCT wc.id) FROM web_clients wc WHERE wc.assigned_associate_id = u.id AND wc.webseo_campaign_id = ? AND wc.is_active = 1) as assigned_clients
    FROM users u
    LEFT JOIN webseo_tasks wt ON wt.associate_id = u.id AND wt.webseo_campaign_id = ?
    WHERE u.role = 'web_seo_associate'
    GROUP BY u.id ORDER BY u.name
  `).all(campaign.id, campaign.id);

  const associateDetail = await Promise.all(associates.map(async a => {
    const byType = await db.prepare(`
      SELECT post_type, SUM(target_count) as target, SUM(completed_count) as completed
      FROM webseo_tasks WHERE associate_id = ? AND webseo_campaign_id = ?
      GROUP BY post_type
    `).all(a.id, campaign.id);

    return { ...a, byType };
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Web SEO Associates Progress</h2>

      {associateDetail.length === 0 ? (
        <div className="card"><p style={{ color: 'var(--text-muted)', margin: 0 }}>No Web SEO Associates assigned to this campaign.</p></div>
      ) : (
        associateDetail.map(a => {
          const pct = a.total_target > 0 ? Math.round((a.total_completed / a.total_target) * 100) : 0;
          return (
            <div key={a.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <h3 style={{ margin: 0, fontWeight: '600' }}>{a.name}</h3>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{a.email} · {a.assigned_clients || 0} clients</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: '600', fontSize: '1.125rem' }}>{a.total_completed || 0} / {a.total_target || 0}</div>
                    <div style={{ fontSize: '0.875rem', color: pct >= 100 ? 'var(--success)' : 'var(--text-muted)' }}>{pct}% overall</div>
                  </div>
                  {basePath && (
                    <Link href={`${basePath}/${a.id}`} style={{
                      padding: '0.4rem 0.75rem',
                      backgroundColor: 'var(--primary)',
                      color: 'white',
                      textDecoration: 'none',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      whiteSpace: 'nowrap'
                    }}>
                      View Dashboard
                    </Link>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', backgroundColor: 'var(--primary)', transition: 'width 0.5s' }}></div>
                </div>
              </div>

              {/* Post type breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                {a.byType.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>No tasks generated yet.</p>
                ) : (
                  a.byType.map(pt => {
                    const ptPct = pt.target > 0 ? Math.round((pt.completed / pt.target) * 100) : 0;
                    return (
                      <div key={pt.post_type} style={{ padding: '0.75rem', backgroundColor: 'var(--background)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{POST_TYPE_LABELS[pt.post_type] || pt.post_type}</div>
                        <div style={{ fontSize: '1rem', fontWeight: '600' }}>{pt.completed}<span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}> / {pt.target}</span></div>
                        <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden', marginTop: '0.25rem' }}>
                          <div style={{ width: `${ptPct}%`, height: '100%', backgroundColor: 'var(--primary)' }}></div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
