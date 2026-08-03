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
 * an earlier task row exists for that exact person/client/type — otherwise
 * it's the very first time that item was ever scheduled (e.g. a client's first
 * day under a brand new writer campaign), and the sheet's cumulative total
 * (which may reflect work finished well before tracking started) would get
 * misread as same-day work. Those get captured as not-completed instead.
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
      EXISTS(
        SELECT 1 FROM seo_tasks st2
        WHERE st2.associate_id = st.associate_id AND st2.client_id = st.client_id
          AND st2.link_type = st.link_type AND st2.task_date < st.task_date
      ) as has_prior
    FROM seo_tasks st JOIN clients c ON c.id = st.client_id
    WHERE st.task_date = ?
  `).all(dateStr);

  const webseoRows = await db.prepare(`
    SELECT wt.associate_id as user_id, wc.business_name as client_name, wt.post_type as label_key,
      wt.target_count, wt.completed_count,
      EXISTS(
        SELECT 1 FROM webseo_tasks wt2
        WHERE wt2.associate_id = wt.associate_id AND wt2.client_id = wt.client_id
          AND wt2.post_type = wt.post_type AND wt2.task_date < wt.task_date
      ) as has_prior
    FROM webseo_tasks wt JOIN web_clients wc ON wc.id = wt.client_id
    WHERE wt.task_date = ?
  `).all(dateStr);

  const writerRows = await db.prepare(`
    SELECT wot.writer_id as user_id, c.name as client_name, wot.task_type, wot.category as label_key,
      wot.target_count, wot.completed_count,
      EXISTS(
        SELECT 1 FROM writer_offpage_tasks wot2
        WHERE wot2.writer_id = wot.writer_id AND wot2.client_id = wot.client_id
          AND wot2.category = wot.category AND wot2.task_type = wot.task_type
          AND wot2.writer_campaign_id = wot.writer_campaign_id AND wot2.task_date < wot.task_date
      ) as has_prior
    FROM writer_offpage_tasks wot JOIN clients c ON c.id = wot.client_id
    WHERE wot.task_date = ? AND wot.writer_campaign_id IS NOT NULL
  `).all(dateStr);

  const entries = [
    ...seoRows.map(r => ({
      user_id: r.user_id, client_name: r.client_name, task_type: '',
      label: LINK_TYPE_LABELS[r.label_key] || r.label_key,
      target_count: r.target_count, completed_count: r.has_prior ? r.completed_count : 0,
    })),
    ...webseoRows.map(r => ({
      user_id: r.user_id, client_name: r.client_name, task_type: '',
      label: POST_TYPE_LABELS[r.label_key] || r.label_key,
      target_count: r.target_count, completed_count: r.has_prior ? r.completed_count : 0,
    })),
    ...writerRows.map(r => ({
      user_id: r.user_id, client_name: r.client_name, task_type: r.task_type,
      label: r.label_key,
      target_count: r.target_count, completed_count: r.has_prior ? r.completed_count : 0,
    })),
  ];

  if (entries.length === 0) return 0;

  const sql = `
    INSERT INTO daily_activity_log (user_id, client_name, task_type, label, work_date, target_count, completed_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, client_name, task_type, label, work_date)
    DO UPDATE SET target_count = excluded.target_count, completed_count = excluded.completed_count, captured_at = CURRENT_TIMESTAMP
  `;
  await db.batch(entries.map(e => ({
    sql,
    args: [e.user_id, e.client_name, e.task_type, e.label, dateStr, e.target_count, e.completed_count],
  })));

  return entries.length;
}
