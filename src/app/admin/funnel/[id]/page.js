import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import Link from 'next/link';
import FunnelDetailClient from './FunnelDetailClient';

export const revalidate = 0;

const BRAND_COLOR = '#16b293';
const CATEGORY_COLORS = {
  'Citations': '#3b82f6',
  'Profiles': '#8b5cf6',
  'Web 2.0': '#10b981',
  'Guest Post': '#0ea5e9',
  'Image Submission': '#ec4899',
  'PDF Submission': '#f59e0b',
};

export default async function FunnelDetailPage({ params }) {
  const { id } = await params;
  const db = await getDb();
  const clientId = parseInt(id, 10);
  const campaign = await getActiveCampaign();

  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);

  if (!client) {
    return (
      <div className="card">
        <p style={{ color: 'var(--danger)', margin: 0 }}>Client not found.</p>
      </div>
    );
  }

  let funnelTasks = [];
  let monthBreakdown = [];

  if (campaign) {
    funnelTasks = await db.prepare(`
      SELECT * FROM tunnel_tasks
      WHERE client_id = ? AND campaign_id = ?
      ORDER BY funnel_month,
        CASE category
          WHEN 'Citations' THEN 1
          WHEN 'Profiles' THEN 2
          WHEN 'Web 2.0' THEN 3
          WHEN 'Guest Post' THEN 4
          WHEN 'Image Submission' THEN 5
          WHEN 'PDF Submission' THEN 6
          ELSE 7
        END
    `).all(clientId, campaign.id);

    monthBreakdown = await db.prepare(`
      SELECT funnel_month,
        COUNT(*) as total_tasks,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks
      FROM tunnel_tasks
      WHERE client_id = ? AND campaign_id = ?
      GROUP BY funnel_month
      ORDER BY funnel_month
    `).all(clientId, campaign.id);
  }

  const currentMonthTasks = funnelTasks.filter(t => t.funnel_month === client.funnel_month);
  const totalTasks = currentMonthTasks.length;
  const completedTasks = currentMonthTasks.filter(t => t.status === 'completed').length;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const tasksByMonth = {};
  funnelTasks.forEach(task => {
    if (!tasksByMonth[task.funnel_month]) tasksByMonth[task.funnel_month] = [];
    tasksByMonth[task.funnel_month].push(task);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Link href="/admin/funnel" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.875rem' }}>
            ← Back to Funnel
          </Link>
          <h1 style={{ fontSize: '1.5rem', margin: '0.5rem 0 0 0' }}>{client.name}</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>{client.website}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{
            padding: '0.4rem 0.75rem',
            backgroundColor: 'rgba(22, 178, 147, 0.1)',
            color: BRAND_COLOR,
            borderRadius: '0.25rem',
            fontSize: '0.75rem',
            fontWeight: '500',
            textTransform: 'uppercase'
          }}>
            {client.tunnel_status === 'active' ? `Funnel — Month ${client.funnel_month} of 3` : 'Graduated'}
          </span>
        </div>
      </div>

      {!campaign ? (
        <div className="card"><p style={{ color: 'var(--danger)', margin: 0 }}>No active campaign.</p></div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <StatCard title="Current Month Tasks" value={totalTasks} color={BRAND_COLOR} />
            <StatCard title="Completed" value={completedTasks} sub={`${progressPercent}% complete`} color="var(--success)" />
            <StatCard title="Pending" value={totalTasks - completedTasks} color="var(--warning)" />
            <StatCard title="Overall Progress" value={`${progressPercent}%`} sub={`${completedTasks} of ${totalTasks} tasks`} color={BRAND_COLOR} />
          </div>

          <div className="card" style={{ backgroundColor: 'rgba(22, 178, 147, 0.05)', border: `1px solid ${BRAND_COLOR}` }}>
            <h3 style={{ margin: '0 0 1rem 0', color: BRAND_COLOR }}>Current Month Progress</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ width: '100%', height: '12px', backgroundColor: 'var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                  <div style={{ width: `${progressPercent}%`, height: '100%', backgroundColor: BRAND_COLOR }}></div>
                </div>
              </div>
              <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: BRAND_COLOR, minWidth: '80px' }}>
                {progressPercent}%
              </span>
            </div>
          </div>

          {monthBreakdown.length > 0 && (
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                Month-by-Month Summary
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                {monthBreakdown.map(m => {
                  const pct = m.total_tasks > 0 ? Math.round((m.completed_tasks / m.total_tasks) * 100) : 0;
                  return (
                    <div key={m.funnel_month} style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '0.5rem' }}>
                      <p style={{ margin: '0 0 0.5rem 0', fontWeight: '600', fontSize: '0.875rem' }}>Month {m.funnel_month}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <div style={{ flex: 1, height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: BRAND_COLOR }}></div>
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)' }}>{pct}%</span>
                      </div>
                      <p style={{ margin: '0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {m.completed_tasks} / {m.total_tasks} tasks
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {Object.keys(tasksByMonth).length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {[1, 2, 3].map(monthNum => {
                const tasks = tasksByMonth[monthNum] || [];
                if (tasks.length === 0) return null;

                const tasksByCategory = {};
                tasks.forEach(task => {
                  if (!tasksByCategory[task.category]) tasksByCategory[task.category] = [];
                  tasksByCategory[task.category].push(task);
                });

                return (
                  <div key={monthNum} className="card">
                    <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: BRAND_COLOR, fontSize: '1.1rem' }}>
                      Month {monthNum} Tasks
                    </h3>

                    {Object.entries(tasksByCategory).map(([category, categoryTasks]) => {
                      const categoryColor = CATEGORY_COLORS[category] || 'var(--primary)';
                      const completed = categoryTasks.filter(t => t.status === 'completed').length;

                      return (
                        <div key={category} style={{ marginBottom: '1.5rem' }}>
                          <h4 style={{
                            margin: '0 0 1rem 0',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            padding: '0.5rem 0.75rem',
                            backgroundColor: `${categoryColor}20`,
                            color: categoryColor,
                            borderRadius: '0.5rem',
                            display: 'inline-block'
                          }}>
                            {category} ({completed}/{categoryTasks.length})
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {categoryTasks.map(task => (
                              <TaskItem key={task.id} task={task} categoryColor={categoryColor} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card">
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>No funnel tasks assigned yet.</p>
            </div>
          )}

          <FunnelDetailClient client={client} />
        </>
      )}
    </div>
  );
}

function StatCard({ title, value, sub, color }) {
  return (
    <div className="card" style={{ borderLeft: `4px solid ${color}` }}>
      <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
        {title}
      </h3>
      <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  );
}

function TaskItem({ task, categoryColor }) {
  return (
    <div style={{
      padding: '0.75rem',
      border: `1px solid ${task.status === 'completed' ? 'var(--success)' : 'var(--border)'}`,
      backgroundColor: task.status === 'completed' ? 'rgba(34, 197, 94, 0.05)' : 'transparent',
      borderRadius: '0.5rem',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <div>
        <div style={{ fontWeight: '500', color: 'var(--foreground)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: '600', color: categoryColor, marginRight: '0.5rem' }}>●</span>
          {task.platform}
        </div>
        {task.url && (
          <a href={task.url} target="_blank" rel="noopener noreferrer" style={{
            fontSize: '0.75rem',
            color: 'var(--primary)',
            textDecoration: 'none',
            marginTop: '0.25rem',
            display: 'inline-block'
          }}>
            {task.url}
          </a>
        )}
        {task.note && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
            Note: {task.note}
          </p>
        )}
      </div>
      <span style={{
        padding: '0.25rem 0.5rem',
        backgroundColor: task.status === 'completed' ? 'var(--success)' : '#e5e7eb',
        color: task.status === 'completed' ? 'white' : '#666',
        borderRadius: '0.25rem',
        fontSize: '0.7rem',
        fontWeight: '600',
        textTransform: 'uppercase'
      }}>
        {task.status === 'completed' ? '✓' : 'Pending'}
      </span>
    </div>
  );
}
