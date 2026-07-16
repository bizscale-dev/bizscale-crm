import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import Link from 'next/link';

const POST_TYPE_LABELS = { guestpost: 'Guest Post', web2: 'Web 2.0', pdf: 'PDF Submission' };

export default async function WritersProgress({ basePath } = {}) {
  const db = await getDb();
  const campaign = await getActiveCampaign();

  if (!campaign) {
    return <div className="card"><p style={{ color: 'var(--danger)', margin: 0 }}>No active campaign found.</p></div>;
  }

  const writers = await db.prepare(`
    SELECT u.id, u.name, u.email,
      SUM(wt.target_count) as total_target,
      SUM(wt.completed_count) as total_completed,
      wa.daily_post_target
    FROM users u
    JOIN writer_assignments wa ON wa.user_id = u.id AND wa.campaign_id = ?
    LEFT JOIN writing_tasks wt ON wt.writer_id = u.id AND wt.campaign_id = ?
    GROUP BY u.id ORDER BY u.name
  `).all(campaign.id, campaign.id);

  const writerDetail = await Promise.all(writers.map(async w => {
    const byType = await db.prepare(`
      SELECT post_type, SUM(target_count) as target, SUM(completed_count) as completed
      FROM writing_tasks WHERE writer_id = ? AND campaign_id = ?
      GROUP BY post_type
    `).all(w.id, campaign.id);

    const byWeek = await db.prepare(`
      SELECT week_number, post_type,
        SUM(target_count) as target, SUM(completed_count) as completed
      FROM writing_tasks WHERE writer_id = ? AND campaign_id = ?
      GROUP BY week_number, post_type ORDER BY week_number
    `).all(w.id, campaign.id);

    return { ...w, byType, byWeek };
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Writers Progress</h2>

      {writerDetail.length === 0 ? (
        <div className="card"><p style={{ color: 'var(--text-muted)', margin: 0 }}>No writers assigned to this campaign.</p></div>
      ) : (
        writerDetail.map(w => {
          const pct = w.total_target > 0 ? Math.round((w.total_completed / w.total_target) * 100) : 0;
          return (
            <div key={w.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <h3 style={{ margin: 0, fontWeight: '600' }}>{w.name}</h3>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{w.email} · Target: {w.daily_post_target}/day</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: '600', fontSize: '1.125rem' }}>{w.total_completed} / {w.total_target}</div>
                    <div style={{ fontSize: '0.875rem', color: pct >= 100 ? 'var(--success)' : 'var(--text-muted)' }}>{pct}% overall</div>
                  </div>
                  {basePath && (
                    <Link href={`${basePath}/${w.id}`} style={{
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
                  <div style={{ width: `${pct}%`, height: '100%', backgroundColor: 'var(--success)' }}></div>
                </div>
              </div>

              {/* Post type breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                {w.byType.map(pt => {
                  const ptPct = pt.target > 0 ? Math.round((pt.completed / pt.target) * 100) : 0;
                  return (
                    <div key={pt.post_type} style={{ padding: '0.75rem', backgroundColor: 'var(--background)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{POST_TYPE_LABELS[pt.post_type] || pt.post_type}</div>
                      <div style={{ fontSize: '1rem', fontWeight: '600' }}>{pt.completed}<span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}> / {pt.target}</span></div>
                      <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden', marginTop: '0.25rem' }}>
                        <div style={{ width: `${ptPct}%`, height: '100%', backgroundColor: 'var(--success)' }}></div>
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
