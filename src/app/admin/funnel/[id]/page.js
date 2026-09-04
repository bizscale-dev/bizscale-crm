import { getDb } from '@/lib/db';
import { getActiveCampaign, LINK_TYPE_LABELS } from '@/lib/services';
import Link from 'next/link';
import FunnelDetailClient from './FunnelDetailClient';

export const revalidate = 0;

const BRAND_COLOR = '#16b293';
const CATEGORY_COLORS = {
  'Citations': '#3b82f6',
  'Profiles': '#8b5cf6',
  'Web 2.0': '#10b981',
  'Image Submission': '#ec4899',
  'PDF Submission': '#f59e0b',
};

// Maps a client's actual seo_tasks day_numbers to weeks 1-4. taskService.js's
// generateSEOTasks only ever generates rows for weeks in
// [funnel_month1_start_week, funnel_month1_current_week] (see advanceMonth1Week
// in src/lib/funnel.js) — one occurrence day per week, chronologically ordered —
// so a client's distinct day_numbers, sorted ascending, correspond 1:1 to that
// week range in order. Deriving the mapping this way (rather than assuming the
// highest day_number is always week 4) is what makes this correct for a client
// manually held at an early week, who may have no week-4 row at all yet.
function buildWeekMap(dayNumbers, startWeek) {
  const uniqueDays = [...new Set(dayNumbers)].sort((a, b) => a - b);
  const map = new Map();
  uniqueDays.forEach((day, idx) => map.set(day, startWeek + idx));
  return map;
}

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

  const isMonth1 = client.funnel_month === 1;
  const isBonusMonth = client.funnel_month === 2 || client.funnel_month === 3;

  // All 3 funnel months are tracked through seo_tasks — real day-distributed,
  // Google Sheet-synced rows by link type. A client only ever has rows for their
  // CURRENT funnel month (moving months regenerates the whole campaign's seo_tasks),
  // so this always reads as just that month's real progress.
  let linkStats = [];
  let weekBreakdown = [];
  let currentWeek = 1;
  let currentWeekLinkStats = [];
  let weekTemplates = [];

  if (campaign) {
    linkStats = await db.prepare(`
      SELECT link_type, SUM(target_count) as target, SUM(completed_count) as completed
      FROM seo_tasks
      WHERE client_id = ? AND campaign_id = ?
      GROUP BY link_type
    `).all(clientId, campaign.id);

    if (isMonth1) {
      const rows = await db.prepare(`
        SELECT day_number, task_date, link_type, target_count, completed_count
        FROM seo_tasks
        WHERE client_id = ? AND campaign_id = ?
      `).all(clientId, campaign.id);

      const dayToWeek = buildWeekMap(rows.map(r => r.day_number), client.funnel_month1_start_week || 1);

      const weekMap = new Map();
      for (const row of rows) {
        const week = dayToWeek.get(row.day_number);
        if (!weekMap.has(week)) weekMap.set(week, { week, target: 0, completed: 0, dueDate: row.task_date });
        const w = weekMap.get(week);
        w.target += row.target_count;
        w.completed += row.completed_count;
        if (row.task_date < w.dueDate) w.dueDate = row.task_date;
      }
      weekBreakdown = [...weekMap.values()].sort((a, b) => a.week - b.week);

      const today = new Date().toISOString().split('T')[0];
      currentWeek = weekBreakdown
        .filter(w => w.dueDate <= today)
        .reduce((max, w) => Math.max(max, w.week), 1);

      const currentWeekStatsMap = new Map();
      for (const row of rows) {
        if (dayToWeek.get(row.day_number) !== currentWeek) continue;
        if (!currentWeekStatsMap.has(row.link_type)) currentWeekStatsMap.set(row.link_type, { link_type: row.link_type, target: 0, completed: 0 });
        const s = currentWeekStatsMap.get(row.link_type);
        s.target += row.target_count;
        s.completed += row.completed_count;
      }
      currentWeekLinkStats = [...currentWeekStatsMap.values()];

      weekTemplates = await db.prepare(`
        SELECT * FROM tunnel_templates WHERE campaign_id = ? AND week_number = ?
        ORDER BY category, order_in_week
      `).all(campaign.id, currentWeek);
    }
  }

  const totalTasks = linkStats.reduce((s, r) => s + r.target, 0);
  const completedTasks = linkStats.reduce((s, r) => s + r.completed, 0);
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const templatesByCategory = {};
  weekTemplates.forEach(t => {
    if (!templatesByCategory[t.category]) templatesByCategory[t.category] = [];
    templatesByCategory[t.category].push(t);
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

          {isMonth1 && weekBreakdown.length > 0 && (
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                Week-by-Week Summary
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                {weekBreakdown.map(w => {
                  const pct = w.target > 0 ? Math.round((w.completed / w.target) * 100) : 0;
                  return (
                    <div key={w.week} style={{
                      padding: '1rem',
                      border: `1px solid ${w.week === currentWeek ? BRAND_COLOR : 'var(--border)'}`,
                      borderRadius: '0.5rem'
                    }}>
                      <p style={{ margin: '0 0 0.5rem 0', fontWeight: '600', fontSize: '0.875rem' }}>
                        Week {w.week}{w.week === currentWeek ? ' (current)' : ''}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <div style={{ flex: 1, height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: BRAND_COLOR }}></div>
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)' }}>{pct}%</span>
                      </div>
                      <p style={{ margin: '0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {w.completed} / {w.target} tasks
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isBonusMonth && linkStats.length > 0 && (
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: BRAND_COLOR, fontSize: '1.1rem' }}>
                Month {client.funnel_month} Tasks
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 0, marginBottom: '1.5rem' }}>
                Tracked day-by-day and synced from the Google Sheet, same as a normal client — not a manual checklist.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {linkStats.map(r => {
                  const pct = r.target > 0 ? Math.round((r.completed / r.target) * 100) : 0;
                  return (
                    <div key={r.link_type}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: '500', fontSize: '0.875rem' }}>{LINK_TYPE_LABELS[r.link_type] || r.link_type}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.completed} / {r.target} ({pct}%)</span>
                      </div>
                      <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: BRAND_COLOR }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isMonth1 && currentWeekLinkStats.length > 0 && (
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: BRAND_COLOR, fontSize: '1.1rem' }}>
                Week {currentWeek} Tasks
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 0, marginBottom: '1.5rem' }}>
                Tracked day-by-day and synced from the Google Sheet, same as a normal client — not a manual checklist.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {currentWeekLinkStats.map(r => {
                  const pct = r.target > 0 ? Math.round((r.completed / r.target) * 100) : 0;
                  return (
                    <div key={r.link_type}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: '500', fontSize: '0.875rem' }}>{LINK_TYPE_LABELS[r.link_type] || r.link_type}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.completed} / {r.target} ({pct}%)</span>
                      </div>
                      <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: BRAND_COLOR }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {Object.keys(templatesByCategory).length > 0 && (
                <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
                  <p style={{ margin: '0 0 1rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Reference platforms for this week (informational — completion is tracked by count via the sheet, not per-platform):
                  </p>
                  {Object.entries(templatesByCategory).map(([category, items]) => {
                    const categoryColor = CATEGORY_COLORS[category] || 'var(--primary)';
                    return (
                      <div key={category} style={{ marginBottom: '1rem' }}>
                        <h4 style={{
                          margin: '0 0 0.75rem 0',
                          fontSize: '0.8rem',
                          fontWeight: '600',
                          padding: '0.4rem 0.65rem',
                          backgroundColor: `${categoryColor}20`,
                          color: categoryColor,
                          borderRadius: '0.5rem',
                          display: 'inline-block'
                        }}>
                          {category}
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          {items.map(t => (
                            <div key={t.id} style={{ fontSize: '0.8rem' }}>
                              <span style={{ fontWeight: '500' }}>{t.platform}</span>
                              {t.url && (
                                <a href={t.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', marginLeft: '0.5rem' }}>
                                  {t.url}
                                </a>
                              )}
                              {t.note && <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>— {t.note}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {totalTasks === 0 && (
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
