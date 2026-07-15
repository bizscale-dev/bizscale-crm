import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import Link from 'next/link';
import Logo from '@/components/Logo';
import Badge from '@/components/ui/Badge';
import StatCard from '@/components/ui/StatCard';

export const revalidate = 0;

const BRAND_COLOR = 'var(--primary)';
const POST_TYPE_LABELS = { web2: 'Web 2.0', guestpost: 'Guest Post' };

export default async function WebSeoAssociateDashboard({ params }) {
  const { id } = await params;
  const db = await getDb();
  const associateId = parseInt(id, 10);
  const campaign = await getActiveCampaign();
  const today = new Date().toISOString().split('T')[0];

  const associate = await db.prepare('SELECT * FROM users WHERE id = ?').get(associateId);

  if (!associate) {
    return (
      <div className="card">
        <p style={{ color: 'var(--danger)', margin: 0 }}>Web SEO Associate not found.</p>
      </div>
    );
  }

  let todayTasks = [], overallStats = null, upcomingDays = [];
  let assignedClientsCount = 0;

  if (campaign) {
    assignedClientsCount = (await db.prepare(`
      SELECT COUNT(*) as c FROM web_clients WHERE campaign_id = ? AND assigned_associate_id = ?
    `).get(campaign.id, associateId)).c;

    todayTasks = await db.prepare(`
      SELECT wt.*, c.business_name as client_name
      FROM webseo_tasks wt
      JOIN web_clients c ON c.id = wt.client_id
      WHERE wt.associate_id = ? AND wt.campaign_id = ? AND wt.task_date = ?
      ORDER BY c.business_name, wt.post_type
    `).all(associateId, campaign.id, today);

    overallStats = await db.prepare(`
      SELECT SUM(target_count) as target, SUM(completed_count) as completed
      FROM webseo_tasks
      WHERE associate_id = ? AND campaign_id = ?
    `).get(associateId, campaign.id);

    upcomingDays = await db.prepare(`
      SELECT task_date, day_number,
        SUM(target_count) as target, SUM(completed_count) as completed,
        COUNT(DISTINCT client_id) as clients
      FROM webseo_tasks
      WHERE associate_id = ? AND campaign_id = ? AND task_date >= ?
      GROUP BY task_date
      ORDER BY task_date
    `).all(associateId, campaign.id, today);
  }

  const tasksByClient = {};
  todayTasks.forEach(t => {
    if (!tasksByClient[t.client_id]) {
      tasksByClient[t.client_id] = { client_id: t.client_id, client_name: t.client_name, tasks: [] };
    }
    tasksByClient[t.client_id].tasks.push(t);
  });

  const todayTarget = todayTasks.reduce((s, t) => s + t.target_count, 0);
  const todayCompleted = todayTasks.reduce((s, t) => s + t.completed_count, 0);
  const overallTarget = overallStats?.target || 0;
  const overallCompleted = overallStats?.completed || 0;
  const overallPercent = overallTarget > 0 ? Math.round((overallCompleted / overallTarget) * 100) : 0;
  const todayPercent = todayTarget > 0 ? Math.round((todayCompleted / todayTarget) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <Link href="/admin/web-seo-associates" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.875rem' }}>
            ← Back to Web SEO Associates
          </Link>
          <h1 style={{ fontSize: '1.5rem', margin: '0.5rem 0 0 0' }}>{associate.name}</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>{associate.email}</p>
        </div>
        <Badge tone={associate.is_active ? 'success' : 'neutral'}>{associate.is_active ? 'active' : 'inactive'}</Badge>
      </div>

      {!campaign ? (
        <div className="card"><p style={{ color: 'var(--danger)', margin: 0 }}>No active campaign.</p></div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <StatCard title="Assigned Clients" value={assignedClientsCount} color={BRAND_COLOR} />
            <StatCard title="Today's Target" value={todayTarget} sub={`${todayCompleted} completed (${todayPercent}%)`} color="var(--primary)" />
            <StatCard title="Overall Target" value={overallTarget} sub={`${overallCompleted} completed (${overallPercent}%)`} color="var(--success)" />
            <StatCard title="Upcoming Days" value={upcomingDays.length} sub="days with tasks" color="var(--warning)" />
          </div>

          <div className="card">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              Today&apos;s Tasks — {today}
            </h2>
            {Object.values(tasksByClient).length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No tasks scheduled for today.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {Object.values(tasksByClient).map(client => (
                  <div key={client.client_id} style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '0.5rem' }}>
                    <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: '600' }}>{client.client_name}</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {client.tasks.map(task => (
                        <div key={task.id} style={{ padding: '0.5rem 0.75rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '0.5rem', fontSize: '0.875rem' }}>
                          <span style={{ fontWeight: '500' }}>{POST_TYPE_LABELS[task.post_type] || task.post_type}</span>
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

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              <Logo width={32} height={32} />
              <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--foreground)' }}>Upcoming Days</h2>
            </div>
            {upcomingDays.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No upcoming tasks.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.75rem 0' }}>Day</th>
                      <th style={{ padding: '0.75rem 0' }}>Date</th>
                      <th style={{ padding: '0.75rem 0' }}>Clients</th>
                      <th style={{ padding: '0.75rem 0' }}>Target</th>
                      <th style={{ padding: '0.75rem 0' }}>Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingDays.map(d => {
                      const pct = d.target > 0 ? Math.round((d.completed / d.target) * 100) : 0;
                      const isToday = d.task_date === today;
                      return (
                        <tr key={d.task_date} style={{ borderBottom: '1px solid var(--border)', backgroundColor: isToday ? 'rgba(22, 178, 147, 0.05)' : 'transparent' }}>
                          <td style={{ padding: '0.75rem 0', fontWeight: isToday ? '600' : 'normal' }}>
                            Day {d.day_number} {isToday && <span style={{ color: BRAND_COLOR, marginLeft: '0.25rem' }}>(Today)</span>}
                          </td>
                          <td style={{ padding: '0.75rem 0' }}>{d.task_date}</td>
                          <td style={{ padding: '0.75rem 0' }}>{d.clients}</td>
                          <td style={{ padding: '0.75rem 0', fontWeight: '600', color: BRAND_COLOR }}>{d.target}</td>
                          <td style={{ padding: '0.75rem 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{ flex: 1, height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', backgroundColor: BRAND_COLOR }}></div>
                              </div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{pct}%</span>
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
        </>
      )}
    </div>
  );
}
