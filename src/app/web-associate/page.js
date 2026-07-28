import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import { verifySession } from '@/lib/session';
import StatCard from '@/components/ui/StatCard';
import PageHeader from '@/components/ui/PageHeader';

export const revalidate = 0;

export default async function WebAssociateDashboard() {
  const db = await getDb();
  const session = await verifySession();
  const userId = session.userId;
  const campaign = await getActiveCampaign();
  const today = new Date().toISOString().split('T')[0];

  let todayTasks = [], pendingTasks = [], overallStats = null;

  if (campaign) {
    todayTasks = await db.prepare(`
      SELECT wt.*, c.business_name as client_name
      FROM webseo_tasks wt
      JOIN web_clients c ON c.id = wt.client_id
      WHERE wt.associate_id = ? AND wt.campaign_id = ? AND wt.task_date = ?
      ORDER BY c.business_name, wt.post_type
    `).all(userId, campaign.id, today);

    // Pending — the task's scheduled day has already passed but it's still not
    // fully done.
    pendingTasks = await db.prepare(`
      SELECT wt.*, c.business_name as client_name
      FROM webseo_tasks wt
      JOIN web_clients c ON c.id = wt.client_id
      WHERE wt.associate_id = ? AND wt.campaign_id = ?
        AND wt.task_date < ? AND wt.completed_count < wt.target_count
      ORDER BY wt.task_date DESC, c.business_name, wt.post_type
    `).all(userId, campaign.id, today);

    overallStats = await db.prepare(`
      SELECT SUM(target_count) as target, SUM(completed_count) as completed
      FROM webseo_tasks
      WHERE associate_id = ? AND campaign_id = ?
    `).get(userId, campaign.id);
  }

  const tasksByClient = {};
  todayTasks.forEach(t => {
    if (!tasksByClient[t.client_id]) {
      tasksByClient[t.client_id] = { client_id: t.client_id, client_name: t.client_name, tasks: [] };
    }
    tasksByClient[t.client_id].tasks.push(t);
  });

  const pendingByClient = {};
  pendingTasks.forEach(t => {
    if (!pendingByClient[t.client_id]) {
      pendingByClient[t.client_id] = { client_id: t.client_id, client_name: t.client_name, tasks: [] };
    }
    pendingByClient[t.client_id].tasks.push(t);
  });

  const todayTarget = todayTasks.reduce((s, t) => s + t.target_count, 0);
  const todayCompleted = todayTasks.reduce((s, t) => s + t.completed_count, 0);
  const hasAnyWork = (overallStats?.target || 0) > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <PageHeader title="My Dashboard" subtitle="Today's Web SEO task targets and progress" />
      {!campaign ? (
        <div className="card"><p style={{ color: 'var(--danger)', margin: 0 }}>No active campaign. Please contact your admin.</p></div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <StatCard title="Today's Target" value={todayTarget} sub={`${todayCompleted} completed`} color="var(--primary)" />
            <StatCard title="Overall Target" value={overallStats?.target || 0} sub={`${overallStats?.completed || 0} completed`} color="var(--success)" />
            <StatCard title="Pending Tasks" value={pendingTasks.length} sub="overdue, not yet completed" color="#f59e0b" />
          </div>

          {/* Pending (overdue) tasks */}
          {Object.values(pendingByClient).length > 0 && (
            <div className="card" style={{ border: '1px solid rgba(245, 158, 11, 0.4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.25rem', margin: 0, color: '#f59e0b' }}>Pending Tasks</h2>
                <span style={{
                  fontSize: '0.75rem', fontWeight: '600', color: '#f59e0b',
                  backgroundColor: 'rgba(245, 158, 11, 0.12)', padding: '0.15rem 0.5rem', borderRadius: '1rem',
                }}>
                  {pendingTasks.length} overdue
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {Object.values(pendingByClient).map(client => (
                  <div key={client.client_id} style={{ padding: '1rem', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: '0.5rem', backgroundColor: 'rgba(245, 158, 11, 0.03)' }}>
                    <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: '600' }}>{client.client_name}</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {client.tasks.map(task => (
                        <div key={task.id} style={{ padding: '0.5rem 0.75rem', backgroundColor: 'var(--background)', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: '0.5rem', fontSize: '0.875rem' }}>
                          <span style={{ fontWeight: '500' }}>{task.post_type === 'guestpost' ? 'Guest Post' : 'Web 2.0'}</span>
                          <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)' }}>{task.completed_count}/{task.target_count}</span>
                          <span style={{ marginLeft: '0.5rem', color: '#f59e0b', fontSize: '0.75rem' }}>Due {task.task_date}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              Today&apos;s Tasks — {today}
            </h2>
            {!hasAnyWork ? (
              <p style={{ color: 'var(--text-muted)' }}>
                No tasks have been scheduled for you yet. Ask your admin to assign clients and generate your Web SEO task schedule.
              </p>
            ) : Object.values(tasksByClient).length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No tasks scheduled for today.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {Object.values(tasksByClient).map(client => (
                  <div key={client.client_id} style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '0.5rem' }}>
                    <div style={{ marginBottom: '0.75rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>{client.client_name}</h3>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {client.tasks.map(task => (
                        <div key={task.id} style={{ padding: '0.5rem 0.75rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '0.5rem', fontSize: '0.875rem' }}>
                          <span style={{ fontWeight: '500' }}>{task.post_type === 'guestpost' ? 'Guest Post' : 'Web 2.0'}</span>
                          <span style={{ marginLeft: '0.5rem', color: task.completed_count >= task.target_count ? 'var(--success)' : 'var(--text-muted)' }}>
                            {task.completed_count}/{task.target_count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
