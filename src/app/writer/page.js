import { getDb } from '@/lib/db';
import { getActiveWriterCampaign } from '@/lib/services';
import { verifySession } from '@/lib/session';
import Logo from '@/components/Logo';
import StatCard from '@/components/ui/StatCard';
import PageHeader from '@/components/ui/PageHeader';

const WEEKS_SCHEDULE = [
  { week: 1, days: '1-5' },
  { week: 2, days: '6-10' },
  { week: 3, days: '11-15' },
  { week: 4, days: '16' },
];

async function loadOffpageStats(db, userId, writerCampaignId, taskType, today) {
  const todayTasks = await db.prepare(`
    SELECT wot.*, c.name as client_name
    FROM writer_offpage_tasks wot
    JOIN clients c ON c.id = wot.client_id
    WHERE wot.writer_id = ? AND wot.writer_campaign_id = ? AND wot.task_type = ? AND wot.task_date = ? AND c.is_active = 1
    ORDER BY c.name, wot.category
  `).all(userId, writerCampaignId, taskType, today);

  // Pending — the task's scheduled day has already passed but it's still not fully
  // done (the sheet's Status column hasn't caught up to Done for it yet).
  const pendingTasks = await db.prepare(`
    SELECT wot.*, c.name as client_name
    FROM writer_offpage_tasks wot
    JOIN clients c ON c.id = wot.client_id
    WHERE wot.writer_id = ? AND wot.writer_campaign_id = ? AND wot.task_type = ?
      AND wot.task_date < ? AND wot.completed_count < wot.target_count AND c.is_active = 1
    ORDER BY wot.task_date DESC, c.name, wot.category
  `).all(userId, writerCampaignId, taskType, today);

  const overallStats = await db.prepare(`
    SELECT SUM(target_count) as target, SUM(completed_count) as completed
    FROM writer_offpage_tasks WHERE writer_id = ? AND writer_campaign_id = ? AND task_type = ?
  `).get(userId, writerCampaignId, taskType);

  const weeklySummary = [];
  for (const schedule of WEEKS_SCHEDULE) {
    const dayStart = parseInt(schedule.days.split('-')[0]);
    const dayEnd = parseInt(schedule.days.split('-')[1] || schedule.days);

    const weekStats = await db.prepare(`
      SELECT SUM(target_count) as target, SUM(completed_count) as completed
      FROM writer_offpage_tasks
      WHERE writer_id = ? AND writer_campaign_id = ? AND task_type = ? AND day_number >= ? AND day_number <= ?
    `).get(userId, writerCampaignId, taskType, dayStart, dayEnd);

    weeklySummary.push({
      week: schedule.week,
      dayRange: `Day ${schedule.days}`,
      target: weekStats?.target || 0,
      completed: weekStats?.completed || 0,
    });
  }

  return { todayTasks, pendingTasks, overallStats, weeklySummary };
}

export default async function WriterDashboard() {
  const db = await getDb();
  const session = await verifySession();
  const userId = session.userId;
  const writerCampaign = await getActiveWriterCampaign();
  const today = new Date().toISOString().split('T')[0];

  let gbp = { todayTasks: [], pendingTasks: [], overallStats: null, weeklySummary: [] };
  let weboff = { todayTasks: [], pendingTasks: [], overallStats: null, weeklySummary: [] };

  if (writerCampaign) {
    // GBP-Off Page / Web-Off Page — read-only, sourced from the Google Sheet tabs
    // (see src/lib/writerOffpageSync.js). Writers mark work Done in the sheet itself.
    gbp = await loadOffpageStats(db, userId, writerCampaign.id, 'gbp', today);
    weboff = await loadOffpageStats(db, userId, writerCampaign.id, 'weboff', today);
  }

  const gbpTodayTarget = gbp.todayTasks.reduce((s, t) => s + t.target_count, 0);
  const gbpTodayCompleted = gbp.todayTasks.reduce((s, t) => s + t.completed_count, 0);
  const gbpOverallPercent = gbp.overallStats?.target > 0 ? Math.round((gbp.overallStats.completed / gbp.overallStats.target) * 100) : 0;
  const gbpTodayPercent = gbpTodayTarget > 0 ? Math.round((gbpTodayCompleted / gbpTodayTarget) * 100) : 0;

  const weboffTodayTarget = weboff.todayTasks.reduce((s, t) => s + t.target_count, 0);
  const weboffTodayCompleted = weboff.todayTasks.reduce((s, t) => s + t.completed_count, 0);
  const weboffOverallPercent = weboff.overallStats?.target > 0 ? Math.round((weboff.overallStats.completed / weboff.overallStats.target) * 100) : 0;
  const weboffTodayPercent = weboffTodayTarget > 0 ? Math.round((weboffTodayCompleted / weboffTodayTarget) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <PageHeader title="My Dashboard" subtitle="Today's targets and progress across your assigned clients" />
      {!writerCampaign ? (
        <div className="card"><p style={{ color: 'var(--danger)', margin: 0 }}>No active writer campaign yet. Please contact your admin.</p></div>
      ) : (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <StatCard title="Today's GBP-Off Tasks" value={gbpTodayTarget} sub={`${gbpTodayCompleted} completed (${gbpTodayPercent}%)`} color="var(--primary)" />
            <StatCard title="Overall GBP-Off Tasks" value={gbp.overallStats?.target || 0} sub={`${gbp.overallStats?.completed || 0} completed (${gbpOverallPercent}%)`} color="var(--primary)" />
            <StatCard title="Today's Web-Off Tasks" value={weboffTodayTarget} sub={`${weboffTodayCompleted} completed (${weboffTodayPercent}%)`} color="var(--success)" />
            <StatCard title="Overall Web-Off Tasks" value={weboff.overallStats?.target || 0} sub={`${weboff.overallStats?.completed || 0} completed (${weboffOverallPercent}%)`} color="var(--success)" />
            <StatCard title="Pending GBP-Off Tasks" value={gbp.pendingTasks.length} sub="overdue, not yet marked Done" color="#f59e0b" />
            <StatCard title="Pending Web-Off Tasks" value={weboff.pendingTasks.length} sub="overdue, not yet marked Done" color="#f59e0b" />
          </div>

          {/* Pending (overdue) tasks */}
          <PendingTasksCard title="Pending GBP-Off Page Tasks" tasks={gbp.pendingTasks} />
          <PendingTasksCard title="Pending Web-Off Page Tasks" tasks={weboff.pendingTasks} />

          {/* Today's GBP-Off Tasks */}
          <TodayTasksCard title="Today's GBP-Off Page Tasks" today={today} tasks={gbp.todayTasks} />

          {/* Today's Web-Off Tasks */}
          <TodayTasksCard title="Today's Web-Off Page Tasks" today={today} tasks={weboff.todayTasks} />

          {/* GBP-Off Page Weekly Summary */}
          <WeeklySummaryCard title="GBP-Off Page Weekly Summary" weeklySummary={gbp.weeklySummary} color="var(--primary)" />

          {/* Web-Off Page Weekly Summary */}
          <WeeklySummaryCard title="Web-Off Page Weekly Summary" weeklySummary={weboff.weeklySummary} color="var(--success)" />
        </>
      )}
    </div>
  );
}

// Groups the flat task list by client so a client's name is shown once, with all
// of their tasks for the day listed underneath it, instead of repeating the name
// on every single task card.
function TodayTasksCard({ title, today, tasks }) {
  const byClient = [];
  const indexByClient = new Map();
  for (const task of tasks) {
    if (!indexByClient.has(task.client_id)) {
      indexByClient.set(task.client_id, byClient.length);
      byClient.push({ client_id: task.client_id, client_name: task.client_name, tasks: [] });
    }
    byClient[indexByClient.get(task.client_id)].tasks.push(task);
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
        {title} — {today}
      </h2>
      {byClient.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No tasks scheduled for today. Check another date in <a href="/writer/tasks" style={{ color: 'var(--primary)' }}>My Tasks</a>.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {byClient.map(client => (
            <div key={client.client_id}>
              <h3 style={{ margin: '0 0 0.6rem 0', fontSize: '0.95rem', fontWeight: '600' }}>{client.client_name}</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                {client.tasks.map(task => (
                  <OffpageTaskCard key={task.id} task={task} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Groups pending (overdue, still incomplete) tasks by client and shows the date
// each was originally due, so they don't just silently disappear once their
// scheduled day has passed.
function PendingTasksCard({ title, tasks }) {
  if (tasks.length === 0) return null;

  const byClient = [];
  const indexByClient = new Map();
  for (const task of tasks) {
    if (!indexByClient.has(task.client_id)) {
      indexByClient.set(task.client_id, byClient.length);
      byClient.push({ client_id: task.client_id, client_name: task.client_name, tasks: [] });
    }
    byClient[indexByClient.get(task.client_id)].tasks.push(task);
  }

  return (
    <div className="card" style={{ border: '1px solid rgba(245, 158, 11, 0.4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', margin: 0, color: '#f59e0b' }}>{title}</h2>
        <span style={{
          fontSize: '0.75rem', fontWeight: '600', color: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.12)', padding: '0.15rem 0.5rem', borderRadius: '1rem',
        }}>
          {tasks.length} overdue
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {byClient.map(client => (
          <div key={client.client_id}>
            <h3 style={{ margin: '0 0 0.6rem 0', fontSize: '0.95rem', fontWeight: '600' }}>{client.client_name}</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              {client.tasks.map(task => (
                <div key={task.id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.6rem',
                  padding: '0.5rem 0.85rem', minWidth: '160px',
                  border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: '0.5rem',
                  backgroundColor: 'rgba(245, 158, 11, 0.06)',
                }}>
                  <span style={{ fontWeight: '600', fontSize: '0.85rem' }}>{task.category}</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: '600', color: '#f59e0b', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
                    {task.completed_count}/{task.target_count} · Due {task.task_date}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OffpageTaskCard({ task }) {
  const done = task.completed_count >= task.target_count;
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.6rem',
      padding: '0.5rem 0.85rem',
      minWidth: '160px',
      border: `1px solid ${done ? 'var(--success)' : 'var(--border)'}`,
      borderRadius: '0.5rem',
      backgroundColor: done ? 'rgba(34, 197, 94, 0.08)' : 'transparent',
    }}>
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        flexShrink: 0,
        backgroundColor: done ? 'var(--success)' : 'var(--border)',
        color: done ? 'white' : 'var(--text-muted)',
        fontSize: '0.7rem',
        fontWeight: 'bold',
      }}>
        {done ? '✓' : ''}
      </span>
      <span style={{ fontWeight: '600', fontSize: '0.85rem' }}>{task.category}</span>
      <span style={{ fontSize: '0.7rem', fontWeight: '600', color: done ? 'var(--success)' : 'var(--text-muted)', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
        {task.completed_count}/{task.target_count} · {done ? 'Complete' : 'Pending'}
      </span>
    </div>
  );
}

function WeeklySummaryCard({ title, weeklySummary, color }) {
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
        <Logo width={32} height={32} />
        <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--foreground)' }}>{title}</h2>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '0.75rem 0' }}>Week</th>
              <th style={{ padding: '0.75rem 0' }}>Days</th>
              <th style={{ padding: '0.75rem 0' }}>Target</th>
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
                    <strong style={{ color }}>{ws.target}</strong>
                  </td>
                  <td style={{ padding: '0.75rem 0', color: pct === 100 ? color : 'var(--text-muted)' }}>
                    {ws.completed}
                  </td>
                  <td style={{ padding: '0.75rem 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ width: '60px', height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color }}></div>
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
  );
}
