'use server';

import { getDb } from '@/lib/db';
import { LINK_TYPE_LABELS } from '@/lib/services';

/**
 * Everything a single SEO Associate / Writer / Web SEO Associate did on one
 * specific date. Used by the "By Person" report on the admin Reports page.
 *
 * Reads from daily_activity_log — a permanent snapshot frozen once per day by
 * the 1 AM capture cron (src/lib/dailyActivityCapture.js), not computed live off
 * the task tables. A day only exists here once it's been captured, so "today"
 * (not yet captured — that happens tomorrow at 1 AM) has nothing to show yet.
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
    SELECT client_name, task_type, label, target_count, completed_count
    FROM daily_activity_log
    WHERE user_id = ? AND work_date = ?
    ORDER BY client_name, label
  `).all(userId, date);

  const toRow = r => ({ client_name: r.client_name, label: r.label, target_count: r.target_count, completed_count: r.completed_count });

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

  // Total target reflects everything actually assigned that day (completed +
  // still-pending), not just the target of rows that happened to have progress.
  const totalTarget = sections.reduce((s, sec) => s + sec.rows.reduce((s2, r) => s2 + r.target_count, 0), 0);
  const totalCompleted = sections.reduce((s, sec) => s + sec.rows.reduce((s2, r) => s2 + r.completed_count, 0), 0);

  // Split each section's assigned rows into what was actually completed that
  // day vs. what was assigned but left incomplete (a partially-done row, e.g.
  // 2/5, shows up in both — some work happened, but it's not fully done either).
  for (const sec of sections) {
    sec.completedRows = sec.rows.filter(r => r.completed_count > 0);
    sec.pendingRows = sec.rows.filter(r => r.completed_count < r.target_count);
    delete sec.rows;
  }

  const totalLogs = sections.reduce((s, sec) => s + (sec.logs?.length || 0), 0);

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    date,
    sections,
    totalTarget,
    totalCompleted,
    totalLogs,
  };
}
