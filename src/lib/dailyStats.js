/**
 * Accurate per-day SEO progress, immune to the "backlog catch-up creep" problem:
 * seo_tasks.completed_count on an old row keeps growing whenever the backfill
 * sync (see sync-completed-links — fills today's own row first, then pays down
 * old debt with whatever's left over) pays it down later, on a different
 * calendar day — so naively summing seo_tasks live for a past week silently
 * folds in catch-up work that actually happened in a later week.
 *
 * The true "done on day D" figure is:
 *   (D's own row(s): daily_activity_log.completed_count once D is finalized —
 *   frozen once, never revisited, see dailyActivityCapture.js — or live
 *   seo_tasks.completed_count while D is still today/future)
 *   + daily_pending_snapshot.resolved_count for D (logged by the sync routes,
 *   attributed to the day backlog was actually paid down, not the day the
 *   original task was scheduled for)
 * These never double-count each other: resolved_count only accumulates progress
 * applied to a task_date strictly earlier than the sync's "today" at the moment
 * it ran, so a day's own row's completed_count (frozen or live) never includes
 * money that resolved_count already counted for that same day. resolved_count is
 * added for every day up to and including today — it's real-time data the sync
 * routes write the moment it happens, not something that needs finalizing the
 * way a day's own row does, so it applies whether D is a past day or today.
 *
 * Future days aren't captured yet and have no sync activity yet either, so they
 * fall back to live seo_tasks numbers — same "not finalized yet" treatment used
 * elsewhere in the app (e.g. the By Person report).
 *
 * target_count has no creep problem (it's structural, not sync-mutated), so it's
 * always read live regardless of date.
 */
export async function getAccurateSeoDailyStats(db, { campaignId, associateId = null }) {
  const today = new Date().toISOString().split('T')[0];

  const associateFilter = associateId ? 'AND st.associate_id = ?' : '';
  const targetArgs = associateId ? [campaignId, associateId] : [campaignId];

  const dayRows = await db.prepare(`
    SELECT st.associate_id, st.day_number, st.task_date, SUM(st.target_count) as target,
      COUNT(DISTINCT st.client_id) as clients
    FROM seo_tasks st
    WHERE st.campaign_id = ? ${associateFilter}
    GROUP BY st.associate_id, st.day_number, st.task_date
    ORDER BY st.task_date
  `).all(...targetArgs);

  if (dayRows.length === 0) return [];

  const associateIds = [...new Set(dayRows.map(r => r.associate_id))];
  const placeholders = associateIds.map(() => '?').join(',');

  const liveCompleted = await db.prepare(`
    SELECT associate_id, task_date, SUM(completed_count) as completed
    FROM seo_tasks
    WHERE campaign_id = ? AND associate_id IN (${placeholders})
    GROUP BY associate_id, task_date
  `).all(campaignId, ...associateIds);
  const liveByKey = new Map(liveCompleted.map(r => [`${r.associate_id}|${r.task_date}`, r.completed]));

  const frozenCompleted = await db.prepare(`
    SELECT user_id, work_date, SUM(completed_count) as completed
    FROM daily_activity_log
    WHERE user_id IN (${placeholders}) AND work_date < ?
    GROUP BY user_id, work_date
  `).all(...associateIds, today);
  const frozenByKey = new Map(frozenCompleted.map(r => [`${r.user_id}|${r.work_date}`, r.completed]));

  const resolvedBacklog = await db.prepare(`
    SELECT user_id, work_date, resolved_count
    FROM daily_pending_snapshot
    WHERE user_id IN (${placeholders}) AND work_date <= ?
  `).all(...associateIds, today);
  const resolvedByKey = new Map(resolvedBacklog.map(r => [`${r.user_id}|${r.work_date}`, r.resolved_count]));

  return dayRows.map(row => {
    const key = `${row.associate_id}|${row.task_date}`;
    const ownRowCompleted = row.task_date < today ? (frozenByKey.get(key) || 0) : (liveByKey.get(key) || 0);
    const completed = ownRowCompleted + (resolvedByKey.get(key) || 0);

    return {
      associate_id: row.associate_id,
      day_number: row.day_number,
      task_date: row.task_date,
      target: row.target,
      clients: row.clients,
      // completed: own-day progress + backlog from OTHER (earlier) days resolved
      // on this day — used for weekly/period totals, so catch-up work counts
      // toward the day it actually happened rather than backdating into the
      // original day. dayCompleted: just this day's own assigned rows, for a
      // per-day "assigned today vs done today" display where blending in
      // unrelated backlog would make the ratio against that day's own target
      // meaningless (e.g. showing >100% from work that was never part of that
      // day's quota to begin with).
      completed,
      dayCompleted: ownRowCompleted,
    };
  });
}
