import { getDb } from '@/lib/db';
import { getActiveCampaign, LINK_TYPE_LABELS } from '@/lib/services';
import { getAccurateSeoDailyStats } from '@/lib/dailyStats';
import Link from 'next/link';
import Logo from '@/components/Logo';
import TasksClient from '@/app/associate/tasks/TasksClient';

const BRAND_COLOR = '#16b293'; // Teal green

function groupByClient(tasks) {
  const byClient = {};
  tasks.forEach(t => {
    if (!byClient[t.client_id]) {
      byClient[t.client_id] = { client_id: t.client_id, client_name: t.client_name, website: t.website, tasks: [] };
    }
    byClient[t.client_id].tasks.push(t);
  });
  return Object.values(byClient);
}

export default async function SeoAssociateDetail({ id, backHref, backLabel, showFunnelLink = false, basePath, selectedDate }) {
  const db = await getDb();
  const associateId = parseInt(id, 10);
  const campaign = await getActiveCampaign();
  const today = new Date().toISOString().split('T')[0];
  const date = selectedDate || today;

  // Guard by role too, not just existence — this component is reachable from
  // role-scoped manager portals, so a mismatched role (e.g. an admin's id) must
  // not leak that user's name/email here.
  const associate = await db.prepare("SELECT * FROM users WHERE id = ? AND role = 'seo_associate'").get(associateId);

  if (!associate) {
    return (
      <div className="card">
        <p style={{ color: 'var(--danger)', margin: 0 }}>SEO Associate not found.</p>
      </div>
    );
  }

  let todayTasks = [], overallStats = null, recentLogs = [], upcomingDays = [], dailySummary = [], pendingTasks = [], weeklySummary = [], funnelClients = [];
  let dateTasks = [], availableDates = [];
  let totalExpectedLinks = 0;
  let dailyTarget = 0;
  let cumulativeByClientType = {};

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
    // schedule (see /admin/funnel) rather than the regular daily link rotation. All
    // 3 funnel months are tracked through seo_tasks (see taskService.js's
    // generateSEOTasks) — Month 1 on its fixed 4-week schedule, Month 2/3 on the
    // Month 2 & 3 Bonus Link Targets.
    funnelClients = await db.prepare(`
      SELECT c.id, c.name, c.website, c.funnel_month, c.tunnel_start_date,
        (SELECT COALESCE(SUM(completed_count), 0) FROM seo_tasks WHERE client_id = c.id AND campaign_id = c.campaign_id) as completed_tasks,
        (SELECT COALESCE(SUM(target_count), 0) FROM seo_tasks WHERE client_id = c.id AND campaign_id = c.campaign_id) as total_tasks
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

    // Single-day (not cumulative) tasks for whichever date is selected in the "My
    // Tasks" view below — the exact same shape/query the associate sees on their own
    // /associate/tasks page, so this shows identically for admin/seo_manager viewers.
    dateTasks = await db.prepare(`
      SELECT st.*, c.name as client_name, c.website,
        (SELECT COUNT(*) FROM link_logs WHERE task_id = st.id) as log_count
      FROM seo_tasks st
      JOIN clients c ON c.id = st.client_id
      WHERE st.associate_id = ? AND st.campaign_id = ? AND st.task_date = ? AND c.is_active = 1
      ORDER BY c.sort_order, st.link_type
    `).all(associateId, campaign.id, date);

    availableDates = await db.prepare(`
      SELECT DISTINCT st.task_date, st.day_number
      FROM seo_tasks st
      JOIN clients c ON c.id = st.client_id
      WHERE st.associate_id = ? AND st.campaign_id = ? AND c.is_active = 1
      ORDER BY st.task_date
    `).all(associateId, campaign.id);

    // Cumulative target/completed per client+link_type, from campaign start through
    // today — so the numbers on each client's card grow day over day (e.g. 6/3 today,
    // 12/6 once the next scheduled day for that client/type syncs) instead of repeating
    // the same day-only slice, which otherwise looks unchanged and confusing.
    const cumulativeRows = await db.prepare(`
      SELECT client_id, link_type, SUM(target_count) as target, SUM(completed_count) as completed
      FROM seo_tasks
      WHERE associate_id = ? AND campaign_id = ? AND task_date <= ?
      GROUP BY client_id, link_type
    `).all(associateId, campaign.id, today);
    for (const row of cumulativeRows) {
      if (!cumulativeByClientType[row.client_id]) cumulativeByClientType[row.client_id] = {};
      cumulativeByClientType[row.client_id][row.link_type] = { target: row.target, completed: row.completed };
    }

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

    // Every day this associate has ever had (or will have) seo_tasks for, past and
    // future alike — past days carry accurate, backlog-creep-immune numbers (see
    // src/lib/dailyStats.js), today/future stay live like before.
    dailySummary = await getAccurateSeoDailyStats(db, { campaignId: campaign.id, associateId });
    upcomingDays = dailySummary.filter(d => d.task_date >= today);

    // Pending — the task's scheduled day has already passed but it's still not
    // fully done.
    pendingTasks = await db.prepare(`
      SELECT st.*, c.name as client_name, c.website
      FROM seo_tasks st
      JOIN clients c ON c.id = st.client_id
      WHERE st.associate_id = ? AND st.campaign_id = ?
        AND st.task_date < ? AND st.completed_count < st.target_count AND c.is_active = 1
      ORDER BY st.task_date DESC, c.sort_order, st.link_type
    `).all(associateId, campaign.id, today);

    // Week boundaries: weeks 1-3 split the days before the campaign's last day as
    // evenly as possible (front-loaded remainder), week 4 is always the single
    // last day — same shape used for the funnel Month 1 weeks in taskService.js.
    // Not hardcoded to 16 total_days, since campaigns don't always run exactly
    // that long (this one runs 15).
    const totalDays = campaign.total_days || 16;
    const remainingDays = Math.max(0, totalDays - 1);
    const weekBase = Math.floor(remainingDays / 3);
    const weekRemainder = remainingDays % 3;
    const week1End = weekBase + (weekRemainder > 0 ? 1 : 0);
    const week2End = week1End + weekBase + (weekRemainder > 1 ? 1 : 0);
    const weeksSchedule = [
      { week: 1, dayStart: 1, dayEnd: week1End },
      { week: 2, dayStart: week1End + 1, dayEnd: week2End },
      { week: 3, dayStart: week2End + 1, dayEnd: totalDays - 1 },
      { week: 4, dayStart: totalDays, dayEnd: totalDays },
    ];

    for (const schedule of weeksSchedule) {
      const weekDays = dailySummary.filter(d => d.day_number >= schedule.dayStart && d.day_number <= schedule.dayEnd);
      weeklySummary.push({
        week: schedule.week,
        dayRange: schedule.dayStart === schedule.dayEnd ? `Day ${schedule.dayStart}` : `Day ${schedule.dayStart}-${schedule.dayEnd}`,
        target: weekDays.reduce((s, d) => s + d.target, 0),
        completed: weekDays.reduce((s, d) => s + d.completed, 0),
      });
    }
  }

  const todayTarget = dailyTarget;
  const todayCompleted = todayTasks.reduce((s, t) => s + t.completed_count, 0);
  const overallPercent = totalExpectedLinks > 0 ? Math.round((overallStats?.completed / totalExpectedLinks) * 100) : 0;
  const todayPercent = todayTarget > 0 ? Math.round((todayCompleted / todayTarget) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Back link and header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Link href={backHref} style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.875rem' }}>
            ← Back to {backLabel}
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
            <StatCard title="All-Time Completed (Sheet)" value={associate.lifetime_completed_links || 0} sub="across all assigned clients, live from sheet" color="#16b293" />
            <StatCard title="Pending Tasks" value={pendingTasks.length} sub="overdue, not yet completed" color="#f59e0b" />
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
                  const cardStyle = {
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem',
                    padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: '0.5rem',
                    textDecoration: 'none', color: 'inherit'
                  };
                  const inner = (
                    <>
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
                    </>
                  );
                  return showFunnelLink ? (
                    <Link key={fc.id} href={`/admin/funnel/${fc.id}`} style={cardStyle}>{inner}</Link>
                  ) : (
                    <div key={fc.id} style={cardStyle}>{inner}</div>
                  );
                })}
              </div>
            </div>
          )}

          {/* My Tasks — identical to what this associate sees on their own
              /associate/tasks page, so admins/managers can view daily task
              progress exactly the same way. */}
          <div className="card">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              My Tasks
            </h2>
            <TasksClient
              tasksByClient={groupByClient(dateTasks)}
              pendingByClient={groupByClient(pendingTasks)}
              availableDates={availableDates}
              selectedDate={date}
              today={today}
              linkTypeLabels={LINK_TYPE_LABELS}
              basePath={basePath}
            />
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

          {/* Daily Summary — every day this associate has had tasks for, past and
              future. Past rows use accurate, backlog-creep-immune numbers (see
              src/lib/dailyStats.js); today/future stay live like before. */}
          <div className="card">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              Daily Summary
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.75rem 0 1rem 0' }}>
              Past days show what was actually completed on that specific day — later catch-up work
              counts toward the day it really happened, not backdated here.
            </p>
            {dailySummary.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No tasks scheduled.</p>
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
                    {dailySummary.map(d => {
                      const pct = d.target > 0 ? Math.round((d.completed / d.target) * 100) : 0;
                      const isToday = d.task_date === today;
                      const isPast = d.task_date < today;
                      return (
                        <tr key={d.task_date} style={{ borderBottom: '1px solid var(--border)', backgroundColor: isToday ? 'rgba(99, 102, 241, 0.05)' : 'transparent', opacity: isPast ? 0.85 : 1 }}>
                          <td style={{ padding: '0.75rem 0', fontWeight: isToday ? '600' : 'normal' }}>Day {d.day_number} {isToday && <span style={{ color: 'var(--primary)', marginLeft: '0.25rem' }}>(Today)</span>}</td>
                          <td style={{ padding: '0.75rem 0' }}>{d.task_date}</td>
                          <td style={{ padding: '0.75rem 0' }}>{d.clients}</td>
                          <td style={{ padding: '0.75rem 0', fontWeight: '600', color: 'var(--primary)' }}>{d.target}</td>
                          <td style={{ padding: '0.75rem 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{ flex: 1, height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', backgroundColor: 'var(--primary)' }}></div>
                              </div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{d.completed}/{d.target} ({pct}%)</span>
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
