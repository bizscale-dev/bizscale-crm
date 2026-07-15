import { getDb } from '@/lib/db';
import { getActiveCampaign, LINK_TYPE_LABELS } from '@/lib/services';
import { verifySession } from '@/lib/session';
import Logo from '@/components/Logo';
import FunnelChecklist from './FunnelChecklist';
import StatCard from '@/components/ui/StatCard';
import PageHeader from '@/components/ui/PageHeader';

export const revalidate = 0; // Disable caching for real-time data

const BRAND_COLOR = 'var(--primary)';

export default async function AssociateDashboard() {
  const db = await getDb();
  const session = await verifySession();
  const userId = session.userId;
  const campaign = await getActiveCampaign();
  const today = new Date().toISOString().split('T')[0];

  let todayTasks = [], overallStats = null, recentLogs = [], upcomingDays = [], weeklySummary = [];
  let totalExpectedLinks = 0;
  let dailyTarget = 0;
  let funnelClients = [];

  if (campaign) {
    const funnelClientRows = await db.prepare(`
      SELECT id, name, website, funnel_month
      FROM clients
      WHERE assigned_associate_id = ? AND campaign_id = ? AND tunnel_status = 'active' AND is_active = 1
      ORDER BY sort_order
    `).all(userId, campaign.id);

    const funnelTasksStmt = db.prepare(`
      SELECT id, category, platform, url, note, status
      FROM tunnel_tasks
      WHERE client_id = ? AND funnel_month = ?
      ORDER BY category, id
    `);

    funnelClients = await Promise.all(funnelClientRows.map(async client => ({
      ...client,
      tasks: await funnelTasksStmt.all(client.id, client.funnel_month),
    })));
  }

  if (campaign) {
    // Get clients assigned to this associate
    const assignedClients = await db.prepare(`
      SELECT COUNT(*) as count FROM clients WHERE assigned_associate_id = ? AND campaign_id = ?
    `).get(userId, campaign.id);

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
    `).all(userId, campaign.id, today);

    overallStats = await db.prepare(`
      SELECT SUM(st.target_count) as target, SUM(st.completed_count) as completed
      FROM seo_tasks st
      JOIN clients c ON c.id = st.client_id
      WHERE st.associate_id = ? AND st.campaign_id = ? AND c.is_active = 1
    `).get(userId, campaign.id);

    recentLogs = await db.prepare(`
      SELECT ll.*, c.name as client_name, st.link_type, st.task_date
      FROM link_logs ll
      JOIN seo_tasks st ON st.id = ll.task_id
      JOIN clients c ON c.id = st.client_id
      WHERE ll.logged_by = ? AND st.campaign_id = ? AND c.is_active = 1
      ORDER BY ll.created_at DESC LIMIT 20
    `).all(userId, campaign.id);

    upcomingDays = await db.prepare(`
      SELECT DISTINCT st.task_date, st.day_number,
        SUM(st.target_count) as target, SUM(st.completed_count) as completed,
        COUNT(DISTINCT st.client_id) as clients
      FROM seo_tasks st
      JOIN clients c ON c.id = st.client_id
      WHERE st.associate_id = ? AND st.campaign_id = ? AND st.task_date >= ? AND c.is_active = 1
      GROUP BY st.task_date
      ORDER BY st.task_date LIMIT 7
    `).all(userId, campaign.id, today);

    // Calculate weekly summary - 16 days total divided into 4 weeks
    // Week 1: Days 1-5 (4 workdays) = 4 × 66 = 264
    // Week 2: Days 6-10 (4 workdays) = 264
    // Week 3: Days 11-15 (4 workdays) = 264
    // Week 4: Day 16 (1 workday) = 66
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
      `).get(userId, campaign.id, dayStart, dayEnd);
      
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
      <PageHeader title="My Dashboard" subtitle="Today's link targets and progress across your assigned clients" />
      {!campaign ? (
        <div className="card"><p style={{ color: 'var(--danger)', margin: 0 }}>No active campaign. Please contact your admin.</p></div>
      ) : (
        <>
          <FunnelChecklist funnelClients={funnelClients} />

          {/* Stats Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <StatCard title="Today's Target" value={todayTarget} sub={`${todayCompleted} completed (${todayPercent}%)`} color="var(--primary)" />
            <StatCard title="Overall Target" value={totalExpectedLinks} sub={`${overallStats?.completed || 0} completed (${overallPercent}%)`} color="var(--success)" />
            <StatCard title="Upcoming Days" value={upcomingDays.length} sub="remaining days with tasks" color="#f59e0b" />
            <StatCard title="Recent Logs" value={recentLogs.length} sub="links logged recently" color="#8b5cf6" />
          </div>

          {/* Today's Tasks by Client */}
          <div className="card">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              Today&apos;s Tasks — {today}
            </h2>
            {Object.values(tasksByClient).length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No tasks scheduled for today. Check another date in <a href="/associate/tasks" style={{ color: 'var(--primary)' }}>My Tasks</a>.</p>
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

