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
  let month1FunnelTasks = [];

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

    // Same Month 1 Funnel breakdown shown on the admin dashboard — these
    // clients have a different weekly-target schedule than the associate
    // progress totals above, so they're shown separately here too.
    month1FunnelTasks = await db.prepare(`
      SELECT st.*, c.name as client_name, u.name as associate_name, u.id as associate_id,
        c.funnel_month1_current_week, c.funnel_month1_start_week
      FROM seo_tasks st
      JOIN clients c ON c.id = st.client_id
      JOIN users u ON u.id = st.associate_id
      WHERE st.campaign_id = ? AND st.task_date = ? AND c.tunnel_status = 'active' AND c.funnel_month = 1 AND c.is_active = 1
      ORDER BY u.name, c.sort_order, st.link_type
    `).all(campaign.id, today);

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

          <Month1FunnelTasksCard tasks={month1FunnelTasks} />
        </>
      )}
    </div>
  );
}

// Groups by associate, then by client — same shape as the associate's own
// "Today's Tasks" list, so the manager sees exactly what the associate sees.
function Month1FunnelTasksCard({ tasks }) {
  if (tasks.length === 0) return null;

  const byAssociate = new Map();
  for (const t of tasks) {
    if (!byAssociate.has(t.associate_id)) byAssociate.set(t.associate_id, { name: t.associate_name, clients: new Map() });
    const assoc = byAssociate.get(t.associate_id);
    if (!assoc.clients.has(t.client_id)) {
      assoc.clients.set(t.client_id, {
        name: t.client_name,
        week: t.funnel_month1_current_week || t.funnel_month1_start_week || 1,
        tasks: [],
      });
    }
    assoc.clients.get(t.client_id).tasks.push(t);
  }

  return (
    <div className="card" style={{ border: '1px solid #3b82f6' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', margin: 0, color: '#3b82f6' }}>Month 1 Funnel Tasks — Today</h2>
        <span style={{
          fontSize: '0.7rem', fontWeight: '600', color: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.12)', padding: '0.15rem 0.5rem', borderRadius: '1rem',
        }}>
          1st Month Funnel Task
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {[...byAssociate.values()].map(assoc => (
          <div key={assoc.name}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>{assoc.name}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[...assoc.clients.values()].map(client => (
                <div key={client.name} style={{ padding: '0.75rem 1rem', border: '1px solid #3b82f6', borderRadius: '0.5rem', backgroundColor: 'rgba(59, 130, 246, 0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: '600', fontSize: '0.875rem' }}>{client.name}</span>
                    <span style={{ fontSize: '0.7rem', color: '#3b82f6' }}>Week {client.week}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {client.tasks.map(task => (
                      <div key={task.id} style={{ padding: '0.4rem 0.65rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '0.5rem', fontSize: '0.8rem' }}>
                        <span style={{ fontWeight: '500' }}>{LINK_TYPE_LABELS[task.link_type] || task.link_type}</span>
                        <span style={{ marginLeft: '0.5rem', color: task.completed_count >= task.target_count ? 'var(--success)' : 'var(--text-muted)' }}>
                          {task.completed_count}/{task.target_count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

