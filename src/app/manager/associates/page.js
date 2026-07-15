import { getDb } from '@/lib/db';
import { getActiveCampaign, LINK_TYPE_LABELS } from '@/lib/services';

export default async function ManagerAssociatesPage() {
  const db = await getDb();
  const campaign = await getActiveCampaign();
  const today = new Date().toISOString().split('T')[0];

  if (!campaign) {
    return (
      <div className="card"><p style={{ color: 'var(--danger)', margin: 0 }}>No active campaign found.</p></div>
    );
  }

  const associates = await db.prepare(`
    SELECT u.id, u.name, u.email,
      SUM(st.target_count) as total_target,
      SUM(st.completed_count) as total_completed,
      aa.client_group_start, aa.client_group_end, aa.daily_link_target
    FROM users u
    JOIN associate_assignments aa ON aa.user_id = u.id AND aa.campaign_id = ?
    LEFT JOIN seo_tasks st ON st.associate_id = u.id AND st.campaign_id = ?
    GROUP BY u.id ORDER BY u.name
  `).all(campaign.id, campaign.id);

  const associateDetail = await Promise.all(associates.map(async a => {
    const byType = await db.prepare(`
      SELECT link_type, SUM(target_count) as target, SUM(completed_count) as completed
      FROM seo_tasks WHERE associate_id = ? AND campaign_id = ?
      GROUP BY link_type
    `).all(a.id, campaign.id);

    const dailyProgress = await db.prepare(`
      SELECT task_date, day_number,
        SUM(target_count) as target, SUM(completed_count) as completed
      FROM seo_tasks WHERE associate_id = ? AND campaign_id = ?
      GROUP BY day_number ORDER BY day_number
    `).all(a.id, campaign.id);

    return { ...a, byType, dailyProgress };
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <h2 style={{ fontSize: '1.5rem', margin: 0 }}>SEO Associates Progress</h2>

      {associateDetail.length === 0 ? (
        <div className="card"><p style={{ color: 'var(--text-muted)', margin: 0 }}>No SEO associates assigned to this campaign.</p></div>
      ) : (
        associateDetail.map(a => {
          const pct = a.total_target > 0 ? Math.round((a.total_completed / a.total_target) * 100) : 0;
          return (
            <div key={a.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <h3 style={{ margin: 0, fontWeight: '600' }}>{a.name}</h3>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{a.email}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: '600', fontSize: '1.125rem' }}>{a.total_completed} / {a.total_target}</div>
                  <div style={{ fontSize: '0.875rem', color: pct >= 100 ? 'var(--success)' : 'var(--text-muted)' }}>{pct}% overall</div>
                </div>
              </div>

              {/* Overall progress bar */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', backgroundColor: 'var(--primary)', transition: 'width 0.5s' }}></div>
                </div>
              </div>

              {/* Link type breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                {a.byType.map(lt => {
                  const ltPct = lt.target > 0 ? Math.round((lt.completed / lt.target) * 100) : 0;
                  return (
                    <div key={lt.link_type} style={{ padding: '0.75rem', backgroundColor: 'var(--background)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{LINK_TYPE_LABELS[lt.link_type] || lt.link_type}</div>
                      <div style={{ fontSize: '1rem', fontWeight: '600' }}>{lt.completed}<span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}> / {lt.target}</span></div>
                      <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden', marginTop: '0.25rem' }}>
                        <div style={{ width: `${ltPct}%`, height: '100%', backgroundColor: 'var(--primary)' }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
