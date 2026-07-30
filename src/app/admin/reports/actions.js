'use server';

import { getDb } from '@/lib/db';
import { LINK_TYPE_LABELS } from '@/lib/services';

const POST_TYPE_LABELS = {
  guestpost: 'Guest Post',
  web2: 'Web 2.0',
};

/**
 * Everything a single SEO Associate / Writer / Web SEO Associate did on one
 * specific date, across whichever task tables apply to their role. Used by the
 * "By Person" report on the admin Reports page.
 */
export async function getUserActivityReport(userId, date) {
  const db = await getDb();

  const user = await db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(userId);
  if (!user) return { error: 'User not found' };

  const sections = [];

  if (user.role === 'seo_associate') {
    const rows = await db.prepare(`
      SELECT st.link_type, st.target_count, st.completed_count, c.name as client_name
      FROM seo_tasks st JOIN clients c ON c.id = st.client_id
      WHERE st.associate_id = ? AND st.task_date = ?
      ORDER BY c.name, st.link_type
    `).all(userId, date);

    const logs = await db.prepare(`
      SELECT ll.created_at, ll.url, ll.anchor_text, ll.notes, st.link_type, c.name as client_name
      FROM link_logs ll
      JOIN seo_tasks st ON st.id = ll.task_id
      JOIN clients c ON c.id = st.client_id
      WHERE ll.logged_by = ? AND st.task_date = ?
      ORDER BY ll.created_at
    `).all(userId, date);

    sections.push({
      title: 'SEO Link Tasks',
      rows: rows.map(r => ({
        client_name: r.client_name,
        label: LINK_TYPE_LABELS[r.link_type] || r.link_type,
        target_count: r.target_count,
        completed_count: r.completed_count,
      })),
      logs: logs.map(l => ({
        time: l.created_at,
        client_name: l.client_name,
        label: LINK_TYPE_LABELS[l.link_type] || l.link_type,
        url: l.url,
        extra: l.anchor_text || l.notes,
      })),
    });
  } else if (user.role === 'writer') {
    const gbpTasks = await db.prepare(`
      SELECT wot.category, wot.target_count, wot.completed_count, c.name as client_name
      FROM writer_offpage_tasks wot JOIN clients c ON c.id = wot.client_id
      WHERE wot.writer_id = ? AND wot.task_date = ? AND wot.task_type = 'gbp'
      ORDER BY c.name, wot.category
    `).all(userId, date);

    const weboffTasks = await db.prepare(`
      SELECT wot.category, wot.target_count, wot.completed_count, c.name as client_name
      FROM writer_offpage_tasks wot JOIN clients c ON c.id = wot.client_id
      WHERE wot.writer_id = ? AND wot.task_date = ? AND wot.task_type = 'weboff'
      ORDER BY c.name, wot.category
    `).all(userId, date);

    sections.push({
      title: 'GBP-Off Page Tasks',
      rows: gbpTasks.map(r => ({ client_name: r.client_name, label: r.category, target_count: r.target_count, completed_count: r.completed_count })),
    });
    sections.push({
      title: 'Web-Off Page Tasks',
      rows: weboffTasks.map(r => ({ client_name: r.client_name, label: r.category, target_count: r.target_count, completed_count: r.completed_count })),
    });
  } else if (user.role === 'web_seo_associate') {
    const rows = await db.prepare(`
      SELECT wt.post_type, wt.target_count, wt.completed_count, wc.business_name as client_name
      FROM webseo_tasks wt JOIN web_clients wc ON wc.id = wt.client_id
      WHERE wt.associate_id = ? AND wt.task_date = ?
      ORDER BY wc.business_name, wt.post_type
    `).all(userId, date);

    sections.push({
      title: 'Web SEO Tasks',
      rows: rows.map(r => ({ client_name: r.client_name, label: POST_TYPE_LABELS[r.post_type] || r.post_type, target_count: r.target_count, completed_count: r.completed_count })),
    });
  } else {
    return { error: 'This user\'s role has no trackable daily work' };
  }

  // Split each section's assigned rows into what was actually completed that
  // day vs. what was assigned but left incomplete (a partially-done row, e.g.
  // 2/5, shows up in both — some work happened, but it's not fully done either).
  for (const sec of sections) {
    sec.completedRows = sec.rows.filter(r => r.completed_count > 0);
    sec.pendingRows = sec.rows.filter(r => r.completed_count < r.target_count);
    delete sec.rows;
  }

  const totalTarget = sections.reduce((s, sec) => s + sec.completedRows.reduce((s2, r) => s2 + r.target_count, 0), 0);
  const totalCompleted = sections.reduce((s, sec) => s + sec.completedRows.reduce((s2, r) => s2 + r.completed_count, 0), 0);
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
