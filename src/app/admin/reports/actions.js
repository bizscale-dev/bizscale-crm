'use server';

import { getDb } from '@/lib/db';
import { LINK_TYPE_LABELS } from '@/lib/services';

/**
 * Everything a single SEO Associate / Writer / Web SEO Associate did on one
 * specific date. Used by the "By Person" report on the admin Reports page.
 *
 * Reads from daily_activity_log — a permanent snapshot frozen once per day by
 * the 12:25 AM capture cron (src/lib/dailyActivityCapture.js), not computed live
 * off the task tables. A day only exists here once it's been captured, so "today"
 * (not yet captured — that happens tomorrow at 12:25 AM) has nothing to show yet.
 */
export async function getUserActivityReport(userId, date) {
  const db = await getDb();

  const user = await db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(userId);
  if (!user) return { error: 'User not found' };

  const today = new Date().toISOString().split('T')[0];
  if (date >= today) {
    return {
      notFinalized: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      date,
    };
  }

  const rows = await db.prepare(`
    SELECT client_name, task_type, label, target_count, completed_count, is_verified, is_funnel
    FROM daily_activity_log
    WHERE user_id = ? AND work_date = ?
    ORDER BY client_name, label
  `).all(userId, date);

  const toRow = r => ({
    client_name: r.client_name, label: r.label, target_count: r.target_count, completed_count: r.completed_count,
    is_verified: !!r.is_verified, is_funnel: !!r.is_funnel,
  });

  let sections;
  if (user.role === 'writer') {
    sections = [
      { title: 'GBP-Off Page Tasks', rows: rows.filter(r => r.task_type === 'gbp').map(toRow) },
      { title: 'Web-Off Page Tasks', rows: rows.filter(r => r.task_type === 'weboff').map(toRow) },
    ];
  } else if (user.role === 'seo_associate') {
    const logs = await db.prepare(`
      SELECT ll.created_at, ll.url, ll.anchor_text, ll.notes, st.link_type, c.name as client_name
      FROM link_logs ll
      JOIN seo_tasks st ON st.id = ll.task_id
      JOIN clients c ON c.id = st.client_id
      WHERE ll.logged_by = ? AND st.task_date = ?
      ORDER BY ll.created_at
    `).all(userId, date);

    sections = [{
      title: 'SEO Link Tasks',
      rows: rows.map(toRow),
      logs: logs.map(l => ({
        time: l.created_at,
        client_name: l.client_name,
        label: LINK_TYPE_LABELS[l.link_type] || l.link_type,
        url: l.url,
        extra: l.anchor_text || l.notes,
      })),
    }];
  } else if (user.role === 'web_seo_associate') {
    sections = [{ title: 'Web SEO Tasks', rows: rows.map(toRow) }];
  } else {
    return { error: 'This user\'s role has no trackable daily work' };
  }

  // Total reflects every row for the day, verified or not — these are the real
  // numbers captured from the sheet for this specific day's tasks. "Unverified"
  // (first-ever-tracked) rows are still flagged and broken out separately below
  // purely so a first-time sync can be visually confirmed, but they're no longer
  // subtracted from the headline total.
  const totalTarget = sections.reduce((s, sec) => s + sec.rows.reduce((s2, r) => s2 + r.target_count, 0), 0);
  const totalCompleted = sections.reduce((s, sec) => s + sec.rows.reduce((s2, r) => s2 + r.completed_count, 0), 0);

  // Pending = how much is still outstanding for the day — target minus completed,
  // summed across every row (verified or not) that isn't fully done yet. Covers
  // both untouched rows (0 completed) and partially-done ones in one shortfall figure.
  // Computed per-row and only over still-incomplete rows (never as an aggregate
  // target-minus-completed), so an overachieving row (completed > target, which
  // the sync legitimately allows — see sync-completed-links) can never make this
  // go negative by offsetting against a different row's shortfall.
  const shortfallOf = rows => rows.filter(r => r.completed_count < r.target_count)
    .reduce((s, r) => s + (r.target_count - r.completed_count), 0);
  const pendingShortfall = sections.reduce((s, sec) => s + shortfallOf(sec.rows), 0);

  // Funnel = same day's work, but only for rows whose client was Funnel-active
  // (Month 1/2/3) at capture time — frozen per-row via is_funnel, not re-derived
  // from the client's current (possibly since-changed) funnel status. Pending is
  // this same per-row shortfall, scoped to funnel rows — every row is either
  // funnel or not, so funnelPendingShortfall + regularPendingShortfall always
  // exactly equals pendingShortfall, both guaranteed non-negative.
  const funnelTarget = sections.reduce((s, sec) => s + sec.rows.filter(r => r.is_funnel).reduce((s2, r) => s2 + r.target_count, 0), 0);
  const funnelCompleted = sections.reduce((s, sec) => s + sec.rows.filter(r => r.is_funnel).reduce((s2, r) => s2 + r.completed_count, 0), 0);
  const funnelPendingShortfall = sections.reduce((s, sec) => s + shortfallOf(sec.rows.filter(r => r.is_funnel)), 0);

  // Split each section's assigned rows into what was actually completed that
  // day vs. what was assigned but left incomplete (a partially-done row, e.g.
  // 2/5, shows up in both — some work happened, but it's not fully done either).
  // Unverified (first-tracked-day) rows are shown separately with their real
  // numbers so the sync itself can be confirmed working.
  for (const sec of sections) {
    const verified = sec.rows.filter(r => r.is_verified);
    sec.completedRows = verified.filter(r => r.completed_count > 0);
    sec.pendingRows = verified.filter(r => r.completed_count < r.target_count);
    sec.unverifiedRows = sec.rows.filter(r => !r.is_verified);
    delete sec.rows;
  }

  const totalLogs = sections.reduce((s, sec) => s + (sec.logs?.length || 0), 0);

  // Pending Backlog box — old overdue work, not this day's own tasks (that's the
  // Funnel/Regular boxes above, via pendingShortfall). Only tracked for
  // seo_associate/web_seo_associate (see daily_pending_snapshot in db.js and the
  // dailyActivityCapture.js doc for why writers aren't covered). No row yet (e.g.
  // a date before this feature shipped) just means nothing to show — 0/0, not an error.
  let pendingResolved = 0;
  let pendingRemaining = 0;
  if (user.role === 'seo_associate' || user.role === 'web_seo_associate') {
    const snapshot = await db.prepare(
      'SELECT resolved_count, remaining_count FROM daily_pending_snapshot WHERE user_id = ? AND work_date = ?'
    ).get(userId, date);
    if (snapshot) {
      pendingResolved = snapshot.resolved_count;
      pendingRemaining = snapshot.remaining_count;
    }
  }

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    date,
    sections,
    totalTarget,
    totalCompleted,
    pendingShortfall,
    funnelTarget,
    funnelCompleted,
    funnelPendingShortfall,
    pendingResolved,
    pendingRemaining,
    totalLogs,
  };
}
