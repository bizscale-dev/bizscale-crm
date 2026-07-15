import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import { verifySession } from '@/lib/session';
import Logo from '@/components/Logo';
import StatCard from '@/components/ui/StatCard';
import PageHeader from '@/components/ui/PageHeader';

const BRAND_COLOR = 'var(--primary)';
const POST_TYPE_LABELS = { guestpost: 'Guest Post', web2: 'Web 2.0', pdf: 'PDF Submission' };

export default async function WriterDashboard() {
  const db = await getDb();
  const session = await verifySession();
  const userId = session.userId;
  const campaign = await getActiveCampaign();
  const today = new Date().toISOString().split('T')[0];

  let todayTasks = [], overallStats = null, recentLogs = [], upcomingDays = [], weeklyBreakdown = [], weeklySummary = [];

  if (campaign) {
    todayTasks = await db.prepare(`
      SELECT * FROM writing_tasks
      WHERE writer_id = ? AND campaign_id = ? AND task_date = ?
      ORDER BY post_type
    `).all(userId, campaign.id, today);

    overallStats = await db.prepare(`
      SELECT SUM(target_count) as target, SUM(completed_count) as completed
      FROM writing_tasks WHERE writer_id = ? AND campaign_id = ?
    `).get(userId, campaign.id);

    recentLogs = await db.prepare(`
      SELECT wl.*, wt.post_type, wt.task_date
      FROM writing_logs wl
      JOIN writing_tasks wt ON wt.id = wl.task_id
      WHERE wl.logged_by = ? AND wt.campaign_id = ?
      ORDER BY wl.created_at DESC LIMIT 20
    `).all(userId, campaign.id);

    upcomingDays = await db.prepare(`
      SELECT DISTINCT task_date, day_number, week_number,
        SUM(target_count) as target, SUM(completed_count) as completed
      FROM writing_tasks
      WHERE writer_id = ? AND campaign_id = ? AND task_date >= ?
      GROUP BY task_date
      ORDER BY task_date LIMIT 7
    `).all(userId, campaign.id, today);

    weeklyBreakdown = await db.prepare(`
      SELECT week_number, post_type,
        SUM(target_count) as target, SUM(completed_count) as completed
      FROM writing_tasks
      WHERE writer_id = ? AND campaign_id = ?
      GROUP BY week_number, post_type
      ORDER BY week_number, post_type
    `).all(userId, campaign.id);

    // Calculate weekly summary
    const weeksInCampaign = Math.ceil(campaign.total_days / 5);
    for (let week = 1; week <= weeksInCampaign; week++) {
      const dayStart = (week - 1) * 5 + 1;
      const dayEnd = Math.min(week * 5, campaign.total_days);
      
      const weekStats = await db.prepare(`
        SELECT 
          SUM(target_count) as target,
          SUM(completed_count) as completed
        FROM writing_tasks
        WHERE writer_id = ? AND campaign_id = ? AND day_number >= ? AND day_number <= ?
      `).get(userId, campaign.id, dayStart, dayEnd);
      
      weeklySummary.push({
        week,
        dayRange: `Day ${dayStart}-${dayEnd}`,
        target: weekStats.target || 0,
        completed: weekStats.completed || 0
      });
    }
  }

  const todayTarget = todayTasks.reduce((s, t) => s + t.target_count, 0);
  const todayCompleted = todayTasks.reduce((s, t) => s + t.completed_count, 0);
  const overallPercent = overallStats?.target > 0 ? Math.round((overallStats.completed / overallStats.target) * 100) : 0;
  const todayPercent = todayTarget > 0 ? Math.round((todayCompleted / todayTarget) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <PageHeader title="My Dashboard" subtitle="Today's writing targets and progress across your assigned clients" />
      {!campaign ? (
        <div className="card"><p style={{ color: 'var(--danger)', margin: 0 }}>No active campaign. Please contact your admin.</p></div>
      ) : (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <StatCard title="Today's Posts Target" value={todayTarget} sub={`${todayCompleted} completed (${todayPercent}%)`} color="var(--success)" />
            <StatCard title="Overall Posts Target" value={overallStats?.target || 0} sub={`${overallStats?.completed || 0} completed (${overallPercent}%)`} color="var(--primary)" />
            <StatCard title="Upcoming Days" value={upcomingDays.length} sub="days with tasks remaining" color="#f59e0b" />
          </div>

          {/* Today's Tasks */}
          <div className="card">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              Today&apos;s Writing Tasks — {today}
            </h2>
            {todayTasks.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No tasks scheduled for today. Check another date in <a href="/writer/tasks" style={{ color: 'var(--primary)' }}>My Tasks</a>.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                {todayTasks.map(task => {
                  const pct = task.target_count > 0 ? Math.round((task.completed_count / task.target_count) * 100) : 0;
                  const done = task.completed_count >= task.target_count;
                  return (
                    <div key={task.id} style={{ padding: '1rem', border: `1px solid ${done ? 'var(--success)' : 'var(--border)'}`, borderRadius: '0.5rem', minWidth: '180px', flex: '1' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ fontWeight: '600' }}>{POST_TYPE_LABELS[task.post_type] || task.post_type}</span>
                        {done && <span style={{ color: 'var(--success)', fontSize: '0.75rem' }}>✓ Done</span>}
                      </div>
                      <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.25rem' }}>
                        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: done ? 'var(--success)' : 'var(--primary)' }}></div>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{task.completed_count} / {task.target_count} posts</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Weekly Summary & Goals */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              <Logo width={32} height={32} />
              <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--foreground)' }}>
                Weekly Summary & Goals
              </h2>
            </div>
            
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.75rem 0' }}>Week</th>
                    <th style={{ padding: '0.75rem 0' }}>Days</th>
                    <th style={{ padding: '0.75rem 0' }}>Posts Target</th>
                    <th style={{ padding: '0.75rem 0' }}>Completed</th>
                    <th style={{ padding: '0.75rem 0' }}>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklySummary.map((ws) => {
                    const pct = ws.target > 0 ? Math.round((ws.completed / ws.target) * 100) : 0;
                    return (
                      <tr key={ws.week} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem 0', fontWeight: '600' }}>Week {ws.week}</td>
                        <td style={{ padding: '0.75rem 0', color: 'var(--text-muted)' }}>{ws.dayRange}</td>
                        <td style={{ padding: '0.75rem 0' }}>
                          <strong style={{ color: BRAND_COLOR }}>{ws.target}</strong>
                        </td>
                        <td style={{ padding: '0.75rem 0', color: pct === 100 ? BRAND_COLOR : 'var(--text-muted)' }}>
                          {ws.completed}
                        </td>
                        <td style={{ padding: '0.75rem 0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: '60px', height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
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
          </div>

          {/* Weekly Breakdown */}
          {weeklyBreakdown.length > 0 && (
            <div className="card">
              <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                Weekly Breakdown
              </h2>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.75rem 0' }}>Week</th>
                      <th style={{ padding: '0.75rem 0' }}>Post Type</th>
                      <th style={{ padding: '0.75rem 0' }}>Target</th>
                      <th style={{ padding: '0.75rem 0' }}>Completed</th>
                      <th style={{ padding: '0.75rem 0' }}>Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyBreakdown.map((w, i) => {
                      const pct = w.target > 0 ? Math.round((w.completed / w.target) * 100) : 0;
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.75rem 0' }}>Week {w.week_number}</td>
                          <td style={{ padding: '0.75rem 0' }}>{POST_TYPE_LABELS[w.post_type] || w.post_type}</td>
                          <td style={{ padding: '0.75rem 0' }}>{w.target}</td>
                          <td style={{ padding: '0.75rem 0' }}>{w.completed}</td>
                          <td style={{ padding: '0.75rem 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{ width: '100px', height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', backgroundColor: 'var(--success)' }}></div>
                              </div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Recent Logs */}
          {recentLogs.length > 0 && (
            <div className="card">
              <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>Recent Posts</h2>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.75rem 0' }}>Date</th>
                      <th style={{ padding: '0.75rem 0' }}>Type</th>
                      <th style={{ padding: '0.75rem 0' }}>Title</th>
                      <th style={{ padding: '0.75rem 0' }}>URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLogs.map(log => (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem 0', color: 'var(--text-muted)' }}>{log.task_date}</td>
                        <td style={{ padding: '0.75rem 0' }}>{POST_TYPE_LABELS[log.post_type] || log.post_type}</td>
                        <td style={{ padding: '0.75rem 0', fontWeight: '500' }}>{log.title}</td>
                        <td style={{ padding: '0.75rem 0', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.url ? <a href={log.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>{log.url}</a> : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

