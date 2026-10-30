import { getAccurateSeoDailyStats, getAccurateWebSeoDailyStats } from '@/lib/dailyStats';
import { expectedLinksFor, liveCompletedLinks } from '@/lib/seoAssociateStats';

// The six headline cards shown at the top of an associate's dashboard (On Time
// Completion, Today's Target, Overall Target, Percentage Completion, Upcoming Days,
// Pending Tasks), computed with the same formulas as SeoAssociateDetail.jsx and
// WebSeoAssociateDetail.jsx — used by the HR portal's Associates page.

const pct = (done, of) => (of > 0 ? Math.min(100, Math.round((done / of) * 100)) : 0);

function fromDaily(dailySummary, today) {
  const past = dailySummary.filter((d) => d.task_date < today);
  const onTime = past.reduce((s, d) => s + d.dayCompleted, 0);
  const onTimeEligible = past.reduce((s, d) => s + d.target, 0);
  return {
    onTime,
    onTimePercent: pct(onTime, onTimeEligible),
    upcomingDays: dailySummary.filter((d) => d.task_date >= today).length,
  };
}

export async function getSeoAssociateCards(db, campaign, associateId) {
  const today = new Date().toISOString().split('T')[0];
  const dailySummary = await getAccurateSeoDailyStats(db, { campaignId: campaign.id, associateId });

  const todayRow = await db.prepare(`
    SELECT COALESCE(SUM(st.target_count), 0) as target, COALESCE(SUM(st.completed_count), 0) as completed
    FROM seo_tasks st JOIN clients c ON c.id = st.client_id
    WHERE st.associate_id = ? AND st.campaign_id = ? AND st.task_date = ? AND c.is_active = 1
      AND NOT (c.tunnel_status = 'active' AND c.funnel_month = 1)
  `).get(associateId, campaign.id, today);

  const regular = await db.prepare(`
    SELECT COUNT(*) as count FROM clients
    WHERE assigned_associate_id = ? AND campaign_id = ? AND is_active = 1
      AND (tunnel_status IS NULL OR tunnel_status NOT IN ('active', 'hold'))
  `).get(associateId, campaign.id);
  const funnel = await db.prepare(`
    SELECT funnel_month, COUNT(*) as count FROM clients
    WHERE assigned_associate_id = ? AND campaign_id = ? AND is_active = 1 AND tunnel_status = 'active'
    GROUP BY funnel_month
  `).all(associateId, campaign.id);
  const funnelCount = (month) => funnel.find((r) => r.funnel_month === month)?.count || 0;

  const overallTarget = expectedLinksFor(campaign, {
    regularClients: regular?.count || 0,
    funnelM2: funnelCount(2),
    funnelM3: funnelCount(3),
  });
  const overallCompleted = await liveCompletedLinks(db, campaign.id, associateId);

  const pendingRow = await db.prepare(`
    SELECT COALESCE(SUM(st.target_count - st.completed_count), 0) as missing
    FROM seo_tasks st JOIN clients c ON c.id = st.client_id
    WHERE st.associate_id = ? AND st.campaign_id = ?
      AND st.task_date < ? AND st.completed_count < st.target_count AND c.is_active = 1
      AND NOT (c.tunnel_status = 'active' AND c.funnel_month = 1)
  `).get(associateId, campaign.id, today);

  return {
    ...fromDaily(dailySummary, today),
    todayTarget: todayRow.target,
    todayCompleted: todayRow.completed,
    todayPercent: todayRow.target > 0 ? Math.round((todayRow.completed / todayRow.target) * 100) : 0,
    overallTarget,
    overallCompleted,
    overallPercent: pct(overallCompleted, overallTarget),
    pending: pendingRow.missing,
  };
}

export async function getWebSeoAssociateCards(db, campaign, associateId) {
  const today = new Date().toISOString().split('T')[0];
  const dailySummary = await getAccurateWebSeoDailyStats(db, { campaignId: campaign.id, associateId });

  const todayRow = await db.prepare(`
    SELECT COALESCE(SUM(target_count), 0) as target, COALESCE(SUM(completed_count), 0) as completed
    FROM webseo_tasks WHERE associate_id = ? AND webseo_campaign_id = ? AND task_date = ?
  `).get(associateId, campaign.id, today);
  const pendingRow = await db.prepare(`
    SELECT COUNT(*) as count FROM webseo_tasks wt JOIN web_clients c ON c.id = wt.client_id
    WHERE wt.associate_id = ? AND wt.webseo_campaign_id = ? AND wt.task_date < ? AND wt.completed_count < wt.target_count
  `).get(associateId, campaign.id, today);

  const overallTarget = dailySummary.reduce((s, d) => s + d.target, 0);
  const overallCompleted = dailySummary.reduce((s, d) => s + d.completed, 0);

  return {
    ...fromDaily(dailySummary, today),
    todayTarget: todayRow.target,
    todayCompleted: todayRow.completed,
    todayPercent: todayRow.target > 0 ? Math.round((todayRow.completed / todayRow.target) * 100) : 0,
    overallTarget,
    overallCompleted,
    overallPercent: pct(overallCompleted, overallTarget),
    pending: pendingRow.count,
  };
}
