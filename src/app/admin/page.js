import { getDb } from '@/lib/db';
import { getActiveCampaign, getCampaignProgress, getLinkTargetsFromCampaign, getTotalLinksPerClient } from '@/lib/services';
import { getAccurateSeoDailyStats } from '@/lib/dailyStats';
import Link from 'next/link';
import LinkTargetsManager from './LinkTargetsManager';
import Logo from '@/components/Logo';
import StatCard from '@/components/ui/StatCard';
import PageHeader from '@/components/ui/PageHeader';

const BRAND_COLOR = 'var(--primary)';

export default async function AdminDashboard() {
  const db = await getDb();
  const campaign = await getActiveCampaign();

  const stats = {
    totalUsers: (await db.prepare("SELECT COUNT(*) as c FROM users WHERE role != 'admin'").get()).c,
    totalAssociates: (await db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'seo_associate' AND is_active = 1").get()).c,
    totalWriters: (await db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'writer' AND is_active = 1").get()).c,
    totalClients: campaign ? (await db.prepare('SELECT COUNT(*) as c FROM clients WHERE campaign_id = ?').get(campaign.id)).c : 0,
    totalSEOTasks: campaign ? (await db.prepare('SELECT COUNT(*) as c FROM seo_tasks WHERE campaign_id = ?').get(campaign.id)).c : 0,
    totalWritingTasks: campaign ? (await db.prepare('SELECT COUNT(*) as c FROM writing_tasks WHERE campaign_id = ?').get(campaign.id)).c : 0,
  };

  let progress = null;
  let associateProgress = [];
  let writerProgress = [];

  if (campaign) {
    progress = await getCampaignProgress(campaign.id);

    associateProgress = await db.prepare(`
      SELECT u.name, u.id,
        SUM(st.target_count) as target,
        SUM(st.completed_count) as completed
      FROM seo_tasks st
      JOIN users u ON u.id = st.associate_id
      WHERE st.campaign_id = ?
      GROUP BY st.associate_id
      ORDER BY u.name
    `).all(campaign.id);

    writerProgress = await db.prepare(`
      SELECT u.name, u.id,
        SUM(wt.target_count) as target,
        SUM(wt.completed_count) as completed
      FROM writing_tasks wt
      JOIN users u ON u.id = wt.writer_id
      WHERE wt.campaign_id = ?
      GROUP BY wt.writer_id
      ORDER BY u.name
    `).all(campaign.id);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <PageHeader title="Admin Dashboard" subtitle="Campaign overview, team progress, and weekly goals at a glance" />

      {/* Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
        <StatCard title="Active Campaign" value={campaign ? campaign.name : 'No Active Campaign'} color={BRAND_COLOR} />
        <StatCard title="Total Clients" value={stats.totalClients} color={BRAND_COLOR} />
        <StatCard title="Total Users" value={stats.totalUsers} color={BRAND_COLOR} />
        <StatCard title="SEO Tasks" value={stats.totalSEOTasks} color={BRAND_COLOR} />
        <StatCard title="Writing Tasks" value={stats.totalWritingTasks} color={BRAND_COLOR} />
      </div>

      {!campaign && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>No Active Campaign Found</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            Get started by creating your first SEO campaign.
          </p>
          <Link href="/admin/campaign" className="btn btn-primary">
            Manage Campaigns
          </Link>
        </div>
      )}

      {campaign && (
        <>
          <LinkTargetsManager
            linkTargets={getLinkTargetsFromCampaign(campaign)}
            totalLinksPerClient={getTotalLinksPerClient(campaign)}
          />

          {/* Weekly Summary and Goals */}
          <WeeklySummary campaign={campaign} db={db} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          
          {/* Associate Progress */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>SEO Associate Progress</h3>
              <Link href="/admin/seo-associates" style={{ fontSize: '0.875rem', color: 'var(--primary)', textDecoration: 'none' }}>
                View All →
              </Link>
            </div>
            {associateProgress.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No associates assigned to this campaign.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {associateProgress.slice(0, 5).map(ap => (
                  <ProgressRow 
                    key={ap.id} 
                    name={ap.name} 
                    target={ap.target} 
                    completed={ap.completed} 
                    color="var(--primary)" 
                  />
                ))}
                {associateProgress.length > 5 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                    +{associateProgress.length - 5} more associates
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Writer Progress */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Writer Progress</h3>
              <Link href="/admin/writers" style={{ fontSize: '0.875rem', color: 'var(--primary)', textDecoration: 'none' }}>
                View All →
              </Link>
            </div>
            {writerProgress.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No writers assigned to this campaign.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {writerProgress.slice(0, 5).map(wp => (
                  <ProgressRow 
                    key={wp.id} 
                    name={wp.name} 
                    target={wp.target} 
                    completed={wp.completed} 
                    color="var(--success)" 
                  />
                ))}
                {writerProgress.length > 5 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                    +{writerProgress.length - 5} more writers
                  </p>
                )}
              </div>
            )}
          </div>

        </div>
        </>
      )}
    </div>
  );
}

function ProgressRow({ name, target, completed, color }) {
  const percent = target > 0 ? Math.round((completed / target) * 100) : 0;
  
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
        <span style={{ fontWeight: '500' }}>{name}</span>
        <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          {completed} / {target} ({percent}%)
        </span>
      </div>
      <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${percent}%`, height: '100%', backgroundColor: color, transition: 'width 0.5s ease-out' }}></div>
      </div>
    </div>
  );
}

async function WeeklySummary({ campaign, db }) {
  // Calculate weekly data for SEO tasks
  const weeklyStats = [];
  const weeksInCampaign = Math.ceil(campaign.total_days / 5);

  // Per-day figures immune to backlog-catch-up creep — a past day's completed
  // count is frozen once, so catch-up work done in a LATER week never bleeds
  // into an earlier week's total (see src/lib/dailyStats.js for the full why).
  const dailyStats = await getAccurateSeoDailyStats(db, { campaignId: campaign.id });

  for (let week = 1; week <= weeksInCampaign; week++) {
    const dayStart = (week - 1) * 5 + 1;
    const dayEnd = Math.min(week * 5, campaign.total_days);

    const weekDays = dailyStats.filter(d => d.day_number >= dayStart && d.day_number <= dayEnd);
    const seoTarget = weekDays.reduce((s, d) => s + d.target, 0);
    const seoCompleted = weekDays.reduce((s, d) => s + d.completed, 0);

    const writingStats = await db.prepare(`
      SELECT
        SUM(target_count) as target,
        SUM(completed_count) as completed
      FROM writing_tasks
      WHERE campaign_id = ? AND day_number >= ? AND day_number <= ?
    `).get(campaign.id, dayStart, dayEnd);

    weeklyStats.push({
      week,
      dayRange: `Day ${dayStart}-${dayEnd}`,
      seo: {
        target: seoTarget,
        completed: seoCompleted
      },
      writing: {
        target: writingStats.target || 0,
        completed: writingStats.completed || 0
      }
    });
  }

  // Campaign-wide daily view — same accurate per-day figures as the weekly table
  // above, just grouped by date across every associate instead of by week, so the
  // whole team's day-by-day history (not just this week's rotation) is visible
  // from the main dashboard too.
  const dailyByDate = new Map();
  for (const d of dailyStats) {
    if (!dailyByDate.has(d.task_date)) {
      dailyByDate.set(d.task_date, { task_date: d.task_date, day_number: d.day_number, target: 0, completed: 0, clients: 0 });
    }
    const entry = dailyByDate.get(d.task_date);
    entry.target += d.target;
    entry.completed += d.completed;
    entry.clients += d.clients;
  }
  const dailyRows = [...dailyByDate.values()].sort((a, b) => a.task_date.localeCompare(b.task_date));
  const today = new Date().toISOString().split('T')[0];

  return (
    <>
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
              <th style={{ padding: '0.75rem 0' }}>SEO Links Target</th>
              <th style={{ padding: '0.75rem 0' }}>SEO Completed</th>
              <th style={{ padding: '0.75rem 0' }}>SEO Progress</th>
              <th style={{ padding: '0.75rem 0' }}>Posts Target</th>
              <th style={{ padding: '0.75rem 0' }}>Posts Completed</th>
              <th style={{ padding: '0.75rem 0' }}>Posts Progress</th>
            </tr>
          </thead>
          <tbody>
            {weeklyStats.map((ws) => {
              const seoPct = ws.seo.target > 0 ? Math.round((ws.seo.completed / ws.seo.target) * 100) : 0;
              const writingPct = ws.writing.target > 0 ? Math.round((ws.writing.completed / ws.writing.target) * 100) : 0;
              
              return (
                <tr key={ws.week} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.75rem 0', fontWeight: '600' }}>Week {ws.week}</td>
                  <td style={{ padding: '0.75rem 0', color: 'var(--text-muted)' }}>{ws.dayRange}</td>
                  
                  <td style={{ padding: '0.75rem 0' }}>
                    <strong style={{ color: BRAND_COLOR }}>{ws.seo.target}</strong>
                  </td>
                  <td style={{ padding: '0.75rem 0', color: seoPct === 100 ? BRAND_COLOR : 'var(--text-muted)' }}>
                    {ws.seo.completed}
                  </td>
                  <td style={{ padding: '0.75rem 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ width: '60px', height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ width: `${seoPct}%`, height: '100%', backgroundColor: BRAND_COLOR }}></div>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{seoPct}%</span>
                    </div>
                  </td>
                  
                  <td style={{ padding: '0.75rem 0' }}>
                    <strong style={{ color: BRAND_COLOR }}>{ws.writing.target}</strong>
                  </td>
                  <td style={{ padding: '0.75rem 0', color: writingPct === 100 ? BRAND_COLOR : 'var(--text-muted)' }}>
                    {ws.writing.completed}
                  </td>
                  <td style={{ padding: '0.75rem 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ width: '60px', height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ width: `${writingPct}%`, height: '100%', backgroundColor: BRAND_COLOR }}></div>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{writingPct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>

    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
        <Logo width={32} height={32} />
        <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--foreground)' }}>
          Daily Summary — SEO Links
        </h2>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.75rem 0 1rem 0' }}>
        Whole team, day by day. Past days show what was actually completed on that specific day — later
        catch-up work counts toward the day it really happened, not backdated here.
      </p>

      {dailyRows.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No SEO tasks scheduled.</p>
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
              {dailyRows.map(d => {
                const pct = d.target > 0 ? Math.round((d.completed / d.target) * 100) : 0;
                const isToday = d.task_date === today;
                const isPast = d.task_date < today;
                return (
                  <tr key={d.task_date} style={{ borderBottom: '1px solid var(--border)', backgroundColor: isToday ? 'rgba(99, 102, 241, 0.05)' : 'transparent', opacity: isPast ? 0.85 : 1 }}>
                    <td style={{ padding: '0.75rem 0', fontWeight: isToday ? '600' : 'normal' }}>Day {d.day_number} {isToday && <span style={{ color: BRAND_COLOR, marginLeft: '0.25rem' }}>(Today)</span>}</td>
                    <td style={{ padding: '0.75rem 0' }}>{d.task_date}</td>
                    <td style={{ padding: '0.75rem 0' }}>{d.clients}</td>
                    <td style={{ padding: '0.75rem 0', fontWeight: '600', color: BRAND_COLOR }}>{d.target}</td>
                    <td style={{ padding: '0.75rem 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ flex: 1, height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: BRAND_COLOR }}></div>
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
    </>
  );
}
