import { getDb } from '@/lib/db';
import { getActiveCampaign, LINK_TYPE_LABELS } from '@/lib/services';
import Link from 'next/link';
import Logo from '@/components/Logo';

export const revalidate = 0; // Disable caching for real-time data

const BRAND_COLOR = '#16b293'; // Teal green

export default async function SEOAssociateDashboard({ params }) {
  const { id } = await params;
  const db = await getDb();
  const associateId = parseInt(id, 10);
  const campaign = await getActiveCampaign();
  const today = new Date().toISOString().split('T')[0];

  // Get associate info
  const associate = await db.prepare('SELECT * FROM users WHERE id = ?').get(associateId);
  
  if (!associate) {
    return (
      <div className="card">
        <p style={{ color: 'var(--danger)', margin: 0 }}>SEO Associate not found.</p>
      </div>
    );
  }

  let todayTasks = [], overallStats = null, recentLogs = [], upcomingDays = [], weeklySummary = [], funnelClients = [];
  let totalExpectedLinks = 0;
  let dailyTarget = 0;

  if (campaign) {
    // Get clients assigned to this associate — excludes clients currently in the
    // Funnel, since they don't get regular seo_tasks and shouldn't count toward
    // this associate's regular link quota.
    const assignedClients = await db.prepare(`
      SELECT COUNT(*) as count FROM clients
      WHERE assigned_associate_id = ? AND campaign_id = ?
        AND (tunnel_status IS NULL OR tunnel_status != 'active')
    `).get(associateId, campaign.id);

    // Clients currently in the Funnel, shown separately since they work a different
    // checklist (see /admin/funnel) rather than the regular daily link rotation.
    funnelClients = await db.prepare(`
      SELECT c.id, c.name, c.website, c.funnel_month, c.tunnel_start_date,
        (SELECT COUNT(*) FROM tunnel_tasks WHERE client_id = c.id AND funnel_month = c.funnel_month AND status = 'completed') as completed_tasks,
        (SELECT COUNT(*) FROM tunnel_tasks WHERE client_id = c.id AND funnel_month = c.funnel_month) as total_tasks
      FROM clients c
      WHERE c.assigned_associate_id = ? AND c.campaign_id = ? AND c.tunnel_status = 'active' AND c.is_active = 1
      ORDER BY c.tunnel_start_date DESC
    `).all(associateId, campaign.id);

    // Get campaign link targets
    const monthlyLinkTargets = {
      web2: campaign.web2_target || 7,
      guestpost: campaign.guestpost_target || 7,
      pdf: campaign.pdf_target || 7,
      profile: campaign.profile_target || 10,
      citation: campaign.citation_target || 10,
      image: campaign.image_target || 9,
    };
    const totalMonthlyTarget = Object.values(monthlyLinkTargets).reduce((a, b) => a + b, 0);

    // Calculate daily target: (total clients × total monthly per client) / 16 working days
    totalExpectedLinks = (assignedClients?.count || 0) * totalMonthlyTarget;
    dailyTarget = Math.round(totalExpectedLinks / 16);

    todayTasks = await db.prepare(`
      SELECT st.*, c.name as client_name, c.website
      FROM seo_tasks st
      JOIN clients c ON c.id = st.client_id
      WHERE st.associate_id = ? AND st.campaign_id = ? AND st.task_date = ? AND c.is_active = 1
      ORDER BY c.sort_order, st.link_type
    `).all(associateId, campaign.id, today);

    overallStats = await db.prepare(`
      SELECT SUM(st.target_count) as target, SUM(st.completed_count) as completed
      FROM seo_tasks st
      JOIN clients c ON c.id = st.client_id
      WHERE st.associate_id = ? AND st.campaign_id = ? AND c.is_active = 1
    `).get(associateId, campaign.id);

    recentLogs = await db.prepare(`
      SELECT ll.*, c.name as client_name, st.link_type, st.task_date
      FROM link_logs ll
      JOIN seo_tasks st ON st.id = ll.task_id
      JOIN clients c ON c.id = st.client_id
      WHERE ll.logged_by = ? AND st.campaign_id = ? AND c.is_active = 1
      ORDER BY ll.created_at DESC LIMIT 20
    `).all(associateId, campaign.id);

    upcomingDays = await db.prepare(`
      SELECT DISTINCT st.task_date, st.day_number,
        SUM(st.target_count) as target, SUM(st.completed_count) as completed,
        COUNT(DISTINCT st.client_id) as clients
      FROM seo_tasks st
      JOIN clients c ON c.id = st.client_id
      WHERE st.associate_id = ? AND st.campaign_id = ? AND st.task_date >= ? AND c.is_active = 1
      GROUP BY st.task_date
      ORDER BY st.task_date LIMIT 7
    `).all(associateId, campaign.id, today);

    // Calculate weekly summary - 16 days total divided into 4 weeks
    // Week 1: Days 1-5 (but skip weekends - actually 3-4 workdays)
    // Week 2: Days 6-10
    // Week 3: Days 11-15
    // Week 4: Day 16
    // For simplicity: each complete week = ~4 working days × 66 links/day = 264 links/week
    const weeksSchedule = [
      { week: 1, days: '1-5', workdays: 4 },
      { week: 2, days: '6-10', workdays: 4 },
      { week: 3, days: '11-15', workdays: 4 },
      { week: 4, days: '16', workdays: 1 }
    ];
    
    for (const schedule of weeksSchedule) {
      const weekTarget = schedule.workdays * dailyTarget; // workdays × 66
      const dayStart = parseInt(schedule.days.split('-')[0]);
      const dayEnd = parseInt(schedule.days.split('-')[1] || schedule.days);
      
      const weekStats = await db.prepare(`
        SELECT 
          SUM(st.target_count) as target,
          SUM(st.completed_count) as completed
        FROM seo_tasks st
        JOIN clients c ON c.id = st.client_id
        WHERE st.associate_id = ? AND st.campaign_id = ? AND st.day_number >= ? AND st.day_number <= ? AND c.is_active = 1
      `).get(associateId, campaign.id, dayStart, dayEnd);
      
      weeklySummary.push({
        week: schedule.week,
        dayRange: `Day ${schedule.days}`,
        target: weekTarget,
        completed: weekStats?.completed || 0
      });
    }
  }

  // Group today's tasks by client
  const tasksByClient = {};
  todayTasks.forEach(t => {
    if (!tasksByClient[t.client_id]) {
      tasksByClient[t.client_id] = { client_id: t.client_id, client_name: t.client_name, website: t.website, tasks: [] };
    }
    tasksByClient[t.client_id].tasks.push(t);
  });

  const todayTarget = dailyTarget; // Use calculated daily target (66 for Mohib)
  const todayCompleted = todayTasks.reduce((s, t) => s + t.completed_count, 0);
  const overallPercent = totalExpectedLinks > 0 ? Math.round((overallStats?.completed / totalExpectedLinks) * 100) : 0;
  const todayPercent = todayTarget > 0 ? Math.round((todayCompleted / todayTarget) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Back link and header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Link href="/admin/seo-associates" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.875rem' }}>
            ← Back to SEO Associates
          </Link>
          <h1 style={{ fontSize: '1.5rem', margin: '0.5rem 0 0 0' }}>{associate.name}</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>{associate.email}</p>
        </div>
        <span style={{
          padding: '0.4rem 0.75rem',
          backgroundColor: associate.is_active ? 'rgba(34, 197, 94, 0.1)' : 'rgba(156, 163, 175, 0.1)',
          color: associate.is_active ? 'var(--success)' : 'var(--text-muted)',
          borderRadius: '0.25rem',
          fontSize: '0.75rem',
          fontWeight: '500',
          textTransform: 'capitalize'
        }}>
          {associate.is_active ? 'active' : 'inactive'}
        </span>
      </div>

      {!campaign ? (
        <div className="card"><p style={{ color: 'var(--danger)', margin: 0 }}>No active campaign. Please contact your admin.</p></div>
      ) : (
        <>
          {/* Stats Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <StatCard title="Today's Target" value={todayTarget} sub={`${todayCompleted} completed (${todayPercent}%)`} color="var(--primary)" />
            <StatCard title="Overall Target" value={totalExpectedLinks} sub={`${overallStats?.completed || 0} completed (${overallPercent}%)`} color="var(--success)" />
            <StatCard title="Upcoming Days" value={upcomingDays.length} sub="remaining days with tasks" color="#f59e0b" />
            <StatCard title="Recent Logs" value={recentLogs.length} sub="links logged recently" color="#8b5cf6" />
          </div>

          {/* Funnel Clients — separate from the regular link rotation above */}
          {funnelClients.length > 0 && (
            <div className="card" style={{ border: '1px solid #16b293', backgroundColor: 'rgba(22, 178, 147, 0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.25rem', margin: 0, color: '#16b293' }}>Funnel Clients</h2>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{funnelClients.length} in funnel</span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.5rem' }}>
                These clients are onboarding through the Funnel checklist and don&apos;t count toward the regular link targets above.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {funnelClients.map(fc => {
                  const pct = fc.total_tasks > 0 ? Math.round((fc.completed_tasks / fc.total_tasks) * 100) : 0;
                  return (
                    <Link
                      key={fc.id}
                      href={`/admin/funnel/${fc.id}`}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem',
                        padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: '0.5rem',
                        textDecoration: 'none', color: 'inherit'
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: '500' }}>{fc.name}</span>
                        <span style={{
                          marginLeft: '0.6rem', fontSize: '0.7rem', padding: '0.2rem 0.5rem',
                          backgroundColor: 'rgba(22, 178, 147, 0.1)', color: '#16b293', borderRadius: '0.25rem', fontWeight: '600'
                        }}>
                          Month {fc.funnel_month} of 3
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '80px', height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#16b293' }}></div>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {fc.completed_tasks}/{fc.total_tasks} ({pct}%)
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Today's Tasks by Client */}
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>{client.client_name}</h3>
                        {client.website && (
                          <a href={client.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.875rem', color: 'var(--primary)', textDecoration: 'none' }}>
                            {client.website}
                          </a>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {client.tasks.map(task => (
                        <div key={task.id} style={{ padding: '0.5rem 0.75rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '0.5rem', fontSize: '0.875rem' }}>
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
                    <th style={{ padding: '0.75rem 0' }}>Links Target</th>
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

          {/* Upcoming days */}
          <div className="card">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              Upcoming Days
            </h2>
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
                      <th style={{ padding: '0.75rem 0' }}>Links Target</th>
                      <th style={{ padding: '0.75rem 0' }}>Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingDays.map(d => {
                      const pct = dailyTarget > 0 ? Math.round((d.completed / dailyTarget) * 100) : 0;
                      const isToday = d.task_date === today;
                      return (
                        <tr key={d.task_date} style={{ borderBottom: '1px solid var(--border)', backgroundColor: isToday ? 'rgba(99, 102, 241, 0.05)' : 'transparent' }}>
                          <td style={{ padding: '0.75rem 0', fontWeight: isToday ? '600' : 'normal' }}>Day {d.day_number} {isToday && <span style={{ color: 'var(--primary)', marginLeft: '0.25rem' }}>(Today)</span>}</td>
                          <td style={{ padding: '0.75rem 0' }}>{d.task_date}</td>
                          <td style={{ padding: '0.75rem 0' }}>{d.clients}</td>
                          <td style={{ padding: '0.75rem 0', fontWeight: '600', color: 'var(--primary)' }}>{dailyTarget}</td>
                          <td style={{ padding: '0.75rem 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{ flex: 1, height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', backgroundColor: 'var(--primary)' }}></div>
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

          {/* Recent Logs */}
          <div className="card">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              Recent Link Logs
            </h2>
            {recentLogs.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No links logged yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.75rem 0' }}>Date</th>
                      <th style={{ padding: '0.75rem 0' }}>Client</th>
                      <th style={{ padding: '0.75rem 0' }}>Type</th>
                      <th style={{ padding: '0.75rem 0' }}>URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLogs.map(log => (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.75rem 0', color: 'var(--text-muted)' }}>{log.task_date}</td>
                        <td style={{ padding: '0.75rem 0', fontWeight: '500' }}>{log.client_name}</td>
                        <td style={{ padding: '0.75rem 0' }}>{LINK_TYPE_LABELS[log.link_type] || log.link_type}</td>
                        <td style={{ padding: '0.75rem 0', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <a href={log.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>{log.url}</a>
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

function StatCard({ title, value, sub, color }) {
  return (
    <div className="card" style={{ borderLeft: `4px solid ${color}` }}>
      <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>{title}</h3>
      <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{sub}</div>
    </div>
  );
}
