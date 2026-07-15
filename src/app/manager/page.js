import { getDb } from '@/lib/db';
import { getActiveCampaign, LINK_TYPE_LABELS } from '@/lib/services';
import StatCard from '@/components/ui/StatCard';
import PageHeader from '@/components/ui/PageHeader';

const POST_TYPE_LABELS = { guestpost: 'Guest Post', web2: 'Web 2.0', pdf: 'PDF Submission' };

export default async function ManagerDashboard() {
  const db = await getDb();
  const campaign = await getActiveCampaign();
  const today = new Date().toISOString().split('T')[0];

  let associateProgress = [], writerProgress = [], seoTotals = null, writingTotals = null, todayActivity = null;

  if (campaign) {
    associateProgress = await db.prepare(`
      SELECT u.id, u.name,
        SUM(st.target_count) as total_target,
        SUM(st.completed_count) as total_completed,
        SUM(CASE WHEN st.task_date = ? THEN st.target_count ELSE 0 END) as today_target,
        SUM(CASE WHEN st.task_date = ? THEN st.completed_count ELSE 0 END) as today_completed
      FROM seo_tasks st JOIN users u ON u.id = st.associate_id
      WHERE st.campaign_id = ?
      GROUP BY st.associate_id ORDER BY u.name
    `).all(today, today, campaign.id);

    writerProgress = await db.prepare(`
      SELECT u.id, u.name,
        SUM(wt.target_count) as total_target,
        SUM(wt.completed_count) as total_completed,
        SUM(CASE WHEN wt.task_date = ? THEN wt.target_count ELSE 0 END) as today_target,
        SUM(CASE WHEN wt.task_date = ? THEN wt.completed_count ELSE 0 END) as today_completed
      FROM writing_tasks wt JOIN users u ON u.id = wt.writer_id
      WHERE wt.campaign_id = ?
      GROUP BY wt.writer_id ORDER BY u.name
    `).all(today, today, campaign.id);

    seoTotals = await db.prepare(`
      SELECT SUM(target_count) as target, SUM(completed_count) as completed
      FROM seo_tasks WHERE campaign_id = ?
    `).get(campaign.id);

    writingTotals = await db.prepare(`
      SELECT SUM(target_count) as target, SUM(completed_count) as completed
      FROM writing_tasks WHERE campaign_id = ?
    `).get(campaign.id);

    todayActivity = {
      seoLinks: (await db.prepare(`
        SELECT COUNT(*) as c FROM link_logs ll
        JOIN seo_tasks st ON st.id = ll.task_id
        WHERE st.campaign_id = ? AND date(ll.created_at) = ?
      `).get(campaign.id, today)).c,
      posts: (await db.prepare(`
        SELECT COUNT(*) as c FROM writing_logs wl
        JOIN writing_tasks wt ON wt.id = wl.task_id
        WHERE wt.campaign_id = ? AND date(wl.created_at) = ?
      `).get(campaign.id, today)).c
    };
  }

  const seoPct = seoTotals?.target > 0 ? Math.round((seoTotals.completed / seoTotals.target) * 100) : 0;
  const writingPct = writingTotals?.target > 0 ? Math.round((writingTotals.completed / writingTotals.target) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <PageHeader title="Manager Overview" subtitle="Associate and writer progress across the active campaign" />
      {!campaign ? (
        <div className="card"><p style={{ color: 'var(--danger)', margin: 0 }}>No active campaign found.</p></div>
      ) : (
        <>
          {/* Campaign Banner */}
          <div className="card" style={{ borderLeft: '4px solid var(--primary)' }}>
            <h2 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Active Campaign</h2>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{campaign.name}</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Started {campaign.start_date} · {campaign.total_days} days
            </div>
          </div>

          {/* Summary Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <StatCard title="SEO Links Overall" value={`${seoTotals?.completed || 0} / ${seoTotals?.target || 0}`} sub={`${seoPct}% complete`} color="var(--primary)" />
            <StatCard title="Writing Posts Overall" value={`${writingTotals?.completed || 0} / ${writingTotals?.target || 0}`} sub={`${writingPct}% complete`} color="var(--success)" />
            <StatCard title="SEO Links Today" value={todayActivity?.seoLinks || 0} sub="links logged today" color="#f59e0b" />
            <StatCard title="Posts Today" value={todayActivity?.posts || 0} sub="posts logged today" color="#8b5cf6" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            {/* Associate Progress */}
            <div className="card">
              <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                SEO Associates
              </h2>
              {associateProgress.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No associates assigned.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {associateProgress.map(ap => {
                    const overall = ap.total_target > 0 ? Math.round((ap.total_completed / ap.total_target) * 100) : 0;
                    const todayPct = ap.today_target > 0 ? Math.round((ap.today_completed / ap.today_target) * 100) : 0;
                    return (
                      <div key={ap.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <span style={{ fontWeight: '500' }}>{ap.name}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ap.total_completed}/{ap.total_target} ({overall}%)</span>
                        </div>
                        <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.25rem' }}>
                          <div style={{ width: `${overall}%`, height: '100%', backgroundColor: 'var(--primary)' }}></div>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Today: {ap.today_completed}/{ap.today_target} ({todayPct}%)
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Writer Progress */}
            <div className="card">
              <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                Writers
              </h2>
              {writerProgress.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No writers assigned.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {writerProgress.map(wp => {
                    const overall = wp.total_target > 0 ? Math.round((wp.total_completed / wp.total_target) * 100) : 0;
                    const todayPct = wp.today_target > 0 ? Math.round((wp.today_completed / wp.today_target) * 100) : 0;
                    return (
                      <div key={wp.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <span style={{ fontWeight: '500' }}>{wp.name}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{wp.total_completed}/{wp.total_target} ({overall}%)</span>
                        </div>
                        <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.25rem' }}>
                          <div style={{ width: `${overall}%`, height: '100%', backgroundColor: 'var(--success)' }}></div>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Today: {wp.today_completed}/{wp.today_target} ({todayPct}%)
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

