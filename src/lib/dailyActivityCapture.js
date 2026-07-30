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
 */
export async function captureDailyActivity(dateStr) {
  const db = await getDb();

  const seoRows = await db.prepare(`
    SELECT st.associate_id as user_id, c.name as client_name, st.link_type as label_key,
      st.target_count, st.completed_count
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
      wot.target_count, wot.completed_count
    FROM writer_offpage_tasks wot JOIN clients c ON c.id = wot.client_id
    WHERE wot.task_date = ?
  `).all(dateStr);

  const entries = [
    ...seoRows.map(r => ({
      user_id: r.user_id, client_name: r.client_name, task_type: '',
      label: LINK_TYPE_LABELS[r.label_key] || r.label_key,
      target_count: r.target_count, completed_count: r.completed_count,
    })),
    ...webseoRows.map(r => ({
      user_id: r.user_id, client_name: r.client_name, task_type: '',
      label: POST_TYPE_LABELS[r.label_key] || r.label_key,
      target_count: r.target_count, completed_count: r.completed_count,
    })),
    ...writerRows.map(r => ({
      user_id: r.user_id, client_name: r.client_name, task_type: r.task_type,
      label: r.label_key,
      target_count: r.target_count, completed_count: r.completed_count,
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
