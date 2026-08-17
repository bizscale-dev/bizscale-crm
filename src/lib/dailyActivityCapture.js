import { getDb } from './db';
import { LINK_TYPE_LABELS } from './services';

const POST_TYPE_LABELS = {
  guestpost: 'Guest Post',
  web2: 'Web 2.0',
};

/**
 * Freezes one day's worth of work into daily_activity_log — a permanent record
 * that's never recalculated again, unlike the live task tables it reads from.
 * Run once daily (see the capture-daily-activity cron), shortly after the day
 * closes out so the day's final sync has already landed. Safe to re-run for the
 * same date (upserts on the table's unique key), so a manual re-trigger or a
 * cron retry can't create duplicates.
 *
 * A row's completed_count can only be trusted as "done on this specific day" if
 * this exact person/client/type combo has been captured on an EARLIER day before
 * — otherwise it's the very first time that item was ever tracked (e.g. a
 * client's first day under a brand new writer campaign), and the sheet's
 * cumulative total (which may reflect work finished well before tracking
 * started) would get misread as same-day work. Those are still captured with
 * their real numbers — so the sync itself can be verified — but flagged
 * is_verified=0.
 *
 * This check is deliberately against daily_activity_log's own permanent history,
 * not the live task tables (seo_tasks/webseo_tasks/writer_offpage_tasks). Those
 * live tables get fully wiped and regenerated whenever the schedule changes
 * (a funnel move, a client roster change, a campaign edit) — which reshuffles
 * which calendar day each client's rotation slot lands on. Checking "does an
 * earlier task_date row exist right now" against that volatile state meant a
 * regeneration could make a client with weeks of real history look like a
 * brand-new "first day" again for up to 5 days after every regeneration.
 * daily_activity_log's own history is permanent and unaffected by that churn.
 *
 * Writer rows are also scoped to the currently active writer_campaign_id —
 * writer_offpage_tasks still has leftover rows from before the Writer Campaign
 * feature existed (writer_campaign_id IS NULL), which must not bleed into a
 * capture for a real, currently-scheduled day.
 */
export async function captureDailyActivity(dateStr) {
  const db = await getDb();

  const seoRows = await db.prepare(`
    SELECT st.associate_id as user_id, c.name as client_name, st.link_type as label_key,
      st.target_count, st.completed_count,
      CASE WHEN c.tunnel_status = 'active' THEN 1 ELSE 0 END as is_funnel
    FROM seo_tasks st JOIN clients c ON c.id = st.client_id
    WHERE st.task_date = ?
  `).all(dateStr);

  const webseoRows = await db.prepare(`
    SELECT wt.associate_id as user_id, wc.business_name as client_name, wt.post_type as label_key,
      wt.target_count, wt.completed_count
    FROM webseo_tasks wt JOIN web_clients wc ON wc.id = wt.client_id
    WHERE wt.task_date = ?
  `).all(dateStr);

  const writerRows = await db.prepare(`
    SELECT wot.writer_id as user_id, c.name as client_name, wot.task_type, wot.category as label_key,
      wot.target_count, wot.completed_count,
      CASE WHEN c.tunnel_status = 'active' THEN 1 ELSE 0 END as is_funnel
    FROM writer_offpage_tasks wot JOIN clients c ON c.id = wot.client_id
    WHERE wot.task_date = ? AND wot.writer_campaign_id IS NOT NULL
  `).all(dateStr);

  const entries = [
    ...seoRows.map(r => ({
      user_id: r.user_id, client_name: r.client_name, task_type: '',
      label: LINK_TYPE_LABELS[r.label_key] || r.label_key,
      target_count: r.target_count, completed_count: r.completed_count, is_funnel: r.is_funnel,
    })),
    ...webseoRows.map(r => ({
      user_id: r.user_id, client_name: r.client_name, task_type: '',
      label: POST_TYPE_LABELS[r.label_key] || r.label_key,
      target_count: r.target_count, completed_count: r.completed_count, is_funnel: 0,
    })),
    ...writerRows.map(r => ({
      user_id: r.user_id, client_name: r.client_name, task_type: r.task_type,
      label: r.label_key,
      target_count: r.target_count, completed_count: r.completed_count, is_funnel: r.is_funnel,
    })),
  ];

  if (entries.length === 0) return 0;

  // Whether each entry's (user, client, task_type, label) combo has ever been
  // captured on an earlier date — computed once against daily_activity_log's own
  // permanent history (see the function doc above for why not the live tables).
  const userIds = [...new Set(entries.map(e => e.user_id))];
  const priorRows = await db.prepare(`
    SELECT DISTINCT user_id, client_name, task_type, label
    FROM daily_activity_log
    WHERE user_id IN (${userIds.map(() => '?').join(',')}) AND work_date < ?
  `).all(...userIds, dateStr);
  const priorKeys = new Set(priorRows.map(r => `${r.user_id}|${r.client_name}|${r.task_type}|${r.label}`));

  for (const e of entries) {
    e.is_verified = priorKeys.has(`${e.user_id}|${e.client_name}|${e.task_type}|${e.label}`) ? 1 : 0;
  }

  const sql = `
    INSERT INTO daily_activity_log (user_id, client_name, task_type, label, work_date, target_count, completed_count, is_verified, is_funnel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, client_name, task_type, label, work_date)
    DO UPDATE SET target_count = excluded.target_count, completed_count = excluded.completed_count,
      is_verified = excluded.is_verified, is_funnel = excluded.is_funnel, captured_at = CURRENT_TIMESTAMP
  `;
  await db.batch(entries.map(e => ({
    sql,
    args: [e.user_id, e.client_name, e.task_type, e.label, dateStr, e.target_count, e.completed_count, e.is_verified, e.is_funnel],
  })));

  await snapshotRemainingBacklog(db, dateStr);

  return entries.length;
}

/**
 * Freezes, once nightly, how much backlog (overdue, still-incomplete work) each
 * SEO/Web SEO associate was carrying as of this capture — a point-in-time snapshot
 * for the "By Person" report's Pending Backlog box, so a past report date shows an
 * honest historical number instead of "whatever's overdue right now". Only
 * seo_tasks/webseo_tasks are scoped here — writers use a different, older sync
 * (writerOffpageSync.js) with no backlog-catchup concept, so they're not tracked.
 * resolved_count (written separately by the sync routes) is left untouched.
 */
async function snapshotRemainingBacklog(db, dateStr) {
  const seoRemaining = await db.prepare(`
    SELECT associate_id as user_id, SUM(target_count - completed_count) as remaining
    FROM seo_tasks
    WHERE task_date <= ? AND completed_count < target_count
    GROUP BY associate_id
  `).all(dateStr);

  const webseoRemaining = await db.prepare(`
    SELECT associate_id as user_id, SUM(target_count - completed_count) as remaining
    FROM webseo_tasks
    WHERE task_date <= ? AND completed_count < target_count
    GROUP BY associate_id
  `).all(dateStr);

  const remainingByUser = new Map();
  for (const row of [...seoRemaining, ...webseoRemaining]) {
    remainingByUser.set(row.user_id, (remainingByUser.get(row.user_id) || 0) + row.remaining);
  }

  if (remainingByUser.size === 0) return;

  const sql = `
    INSERT INTO daily_pending_snapshot (user_id, work_date, remaining_count)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, work_date) DO UPDATE SET remaining_count = excluded.remaining_count
  `;
  await db.batch([...remainingByUser.entries()].map(([userId, remaining]) => ({
    sql,
    args: [userId, dateStr, remaining],
  })));
}
