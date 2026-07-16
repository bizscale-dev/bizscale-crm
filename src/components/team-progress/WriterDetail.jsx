import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import Link from 'next/link';
import Logo from '@/components/Logo';

const BRAND_COLOR = '#16b293'; // Teal green
const POST_TYPE_LABELS = { guestpost: 'Guest Post', web2: 'Web 2.0', pdf: 'PDF Submission' };

export default async function WriterDetail({ id, backHref, backLabel }) {
  const db = await getDb();
  const writerId = parseInt(id, 10);
  const campaign = await getActiveCampaign();
  const today = new Date().toISOString().split('T')[0];

  // Guard by role too, not just existence — this component is reachable from
  // role-scoped manager portals, so a mismatched role must not leak that user's
  // name/email here.
  const writer = await db.prepare("SELECT * FROM users WHERE id = ? AND role = 'writer'").get(writerId);

  if (!writer) {
    return (
      <div className="card">
        <p style={{ color: 'var(--danger)', margin: 0 }}>Writer not found.</p>
      </div>
    );
  }

  let todayTasks = [], overallStats = null, recentLogs = [], upcomingDays = [], weeklyBreakdown = [], weeklySummary = [];
  let todayClientsById = {}, allWriterClients = [];
  let cumulativeByClientType = {};

  if (campaign) {
    todayTasks = await db.prepare(`
      SELECT * FROM writing_tasks
      WHERE writer_id = ? AND campaign_id = ? AND task_date = ?
      ORDER BY post_type
    `).all(writerId, campaign.id, today);

    // Cumulative target/completed per client+post_type, from campaign start through
    // today — so the numbers on each client's card grow day over day instead of
    // repeating the same day-only slice, which otherwise looks unchanged and confusing.
    const cumulativeRows = await db.prepare(`
      SELECT client_id, post_type, SUM(target_count) as target, SUM(completed_count) as completed
      FROM writing_tasks
      WHERE writer_id = ? AND campaign_id = ? AND task_date <= ?
      GROUP BY client_id, post_type
    `).all(writerId, campaign.id, today);
    for (const row of cumulativeRows) {
      if (!cumulativeByClientType[row.client_id]) cumulativeByClientType[row.client_id] = {};
      cumulativeByClientType[row.client_id][row.post_type] = { target: row.target, completed: row.completed };
    }

    overallStats = await db.prepare(`
      SELECT SUM(target_count) as target, SUM(completed_count) as completed
      FROM writing_tasks WHERE writer_id = ? AND campaign_id = ?
    `).get(writerId, campaign.id);

    recentLogs = await db.prepare(`
      SELECT wl.*, wt.post_type, wt.task_date
      FROM writing_logs wl
      JOIN writing_tasks wt ON wt.id = wl.task_id
      WHERE wl.logged_by = ? AND wt.campaign_id = ?
      ORDER BY wl.created_at DESC LIMIT 20
    `).all(writerId, campaign.id);

    upcomingDays = await db.prepare(`
      SELECT DISTINCT task_date, day_number, week_number,
        SUM(target_count) as target, SUM(completed_count) as completed
      FROM writing_tasks
      WHERE writer_id = ? AND campaign_id = ? AND task_date >= ?
      GROUP BY task_date
      ORDER BY task_date LIMIT 7
    `).all(writerId, campaign.id, today);

    weeklyBreakdown = await db.prepare(`
      SELECT week_number, post_type,
        SUM(target_count) as target, SUM(completed_count) as completed
      FROM writing_tasks
      WHERE writer_id = ? AND campaign_id = ?
      GROUP BY week_number, post_type
      ORDER BY week_number, post_type
    `).all(writerId, campaign.id);

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
      `).get(writerId, campaign.id, dayStart, dayEnd);

      weeklySummary.push({
        week,
        dayRange: `Day ${dayStart}-${dayEnd}`,
        target: weekStats.target || 0,
        completed: weekStats.completed || 0
      });
    }

    // Pre-fetch client names needed by the JSX below, so the render pass itself
    // stays synchronous (React can't await inside .map() callbacks).
    const todayClientIds = [...new Set(todayTasks.map(t => t.client_id))];
    if (todayClientIds.length > 0) {
      const placeholders = todayClientIds.map(() => '?').join(',');
      const rows = await db.prepare(`SELECT id, name FROM clients WHERE id IN (${placeholders})`).all(...todayClientIds);
      for (const r of rows) todayClientsById[r.id] = r;
    }

    allWriterClients = await db.prepare(`
      SELECT DISTINCT c.id, c.name FROM clients c
      WHERE c.assigned_writer_id = ? AND c.campaign_id = ? AND c.is_active = 1
      ORDER BY c.name
    `).all(writerId, campaign.id);
  }

  const todayTarget = todayTasks.reduce((s, t) => s + t.target_count, 0);
  const todayCompleted = todayTasks.reduce((s, t) => s + t.completed_count, 0);
  const overallPercent = overallStats?.target > 0 ? Math.round((overallStats.completed / overallStats.target) * 100) : 0;
  const todayPercent = todayTarget > 0 ? Math.round((todayCompleted / todayTarget) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Back link and header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Link href={backHref} style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.875rem' }}>
            ← Back to {backLabel}
          </Link>
          <h1 style={{ fontSize: '1.5rem', margin: '0.5rem 0 0 0' }}>{writer.name}</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>{writer.email}</p>
        </div>
        <span style={{
          padding: '0.4rem 0.75rem',
          backgroundColor: writer.is_active ? 'rgba(34, 197, 94, 0.1)' : 'rgba(156, 163, 175, 0.1)',
          color: writer.is_active ? 'var(--success)' : 'var(--text-muted)',
          borderRadius: '0.25rem',
          fontSize: '0.75rem',
          fontWeight: '500',
          textTransform: 'capitalize'
        }}>
          {writer.is_active ? 'active' : 'inactive'}
        </span>
      </div>

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

          {/* Today's Clients - Assigned vs Not Assigned */}
          <div className="card">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              Today&apos;s Clients — {today}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              {/* Clients assigned for today */}
              <div>
                <h3 style={{ fontSize: '0.875rem', color: 'var(--success)', fontWeight: '600', marginBottom: '1rem', textTransform: 'uppercase' }}>
                  ✓ Assigned for Today ({todayTasks.length > 0 ? [...new Set(todayTasks.map(t => t.client_id))].length : 0})
                </h3>
                {todayTasks.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No clients scheduled for today.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {[...new Map(todayTasks.map(t => [t.client_id, t])).values()].map(task => {
                      const clientTasks = todayTasks
                        .filter(t => t.client_id === task.client_id)
                        .map(t => {
                          const cumulative = cumulativeByClientType[t.client_id]?.[t.post_type];
                          return {
                            ...t,
                            target_count: cumulative?.target ?? t.target_count,
                            completed_count: cumulative?.completed ?? t.completed_count,
                          };
                        });
                      const totalTarget = clientTasks.reduce((s, t) => s + t.target_count, 0);
                      const totalCompleted = clientTasks.reduce((s, t) => s + t.completed_count, 0);
                      const pct = totalTarget > 0 ? Math.round((totalCompleted / totalTarget) * 100) : 0;

                      const client = todayClientsById[task.client_id] || { name: 'Unknown' };
                      return (
                        <div key={task.client_id} style={{ padding: '0.75rem', backgroundColor: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: '0.5rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <span style={{ fontWeight: '500', color: 'var(--foreground)' }}>{client.name}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{totalCompleted}/{totalTarget}</span>
                          </div>
                          <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', backgroundColor: 'var(--success)' }}></div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                            {clientTasks.map(t => (
                              <span key={t.id} style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', backgroundColor: 'rgba(22, 178, 147, 0.1)', color: BRAND_COLOR, borderRadius: '0.25rem', fontWeight: '500' }}>
                                {POST_TYPE_LABELS[t.post_type] || t.post_type}: {t.completed_count}/{t.target_count}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Clients NOT assigned for today */}
              <div>
                <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '1rem', textTransform: 'uppercase' }}>
                  ✗ Not Assigned for Today
                </h3>
                {todayTasks.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Check scheduling or contact admin.</p>
                ) : (() => {
                  const assignedTodayIds = new Set(todayTasks.map(t => t.client_id));
                  const notAssignedToday = allWriterClients.filter(c => !assignedTodayIds.has(c.id));

                  return notAssignedToday.length === 0 ? (
                    <p style={{ color: 'var(--success)', fontSize: '0.875rem', fontWeight: '500' }}>All assigned clients are on today&apos;s schedule! 🎉</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {notAssignedToday.slice(0, 10).map(client => (
                        <div key={client.id} style={{ padding: '0.5rem 0.75rem', backgroundColor: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '0.25rem', fontSize: '0.875rem', color: 'var(--foreground)' }}>
                          {client.name}
                        </div>
                      ))}
                      {notAssignedToday.length > 10 && (
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                          +{notAssignedToday.length - 10} more clients
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Today's Tasks */}
          <div className="card">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              Today&apos;s Writing Tasks — {today}
            </h2>
            {todayTasks.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No tasks scheduled for today.</p>
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

function StatCard({ title, value, sub, color }) {
  return (
    <div className="card" style={{ borderLeft: `4px solid ${color}` }}>
      <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>{title}</h3>
      <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{sub}</div>
    </div>
  );
}
