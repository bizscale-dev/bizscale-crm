'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';

/**
 * Saves (or clears, with an empty url) the blog link of one client on a "blog link per client" task for
 * the signed-in Web SEO manager. When every client has a link the task submits itself: the description
 * lists "Client: link" per line, and a task finished after its due time goes to admin approval like any
 * other late submission.
 */
export async function setClientBlogLink(taskId, index, url) {
  const session = await verifySession();
  if (!session || session.role !== 'web_seo_manager') return { error: 'Not authorized' };

  const id = parseInt(taskId, 10);
  const idx = parseInt(index, 10);
  const link = typeof url === 'string' ? url.trim() : '';
  if (!id || Number.isNaN(idx) || idx < 0) return { error: 'Invalid item' };
  if (link) {
    if (link.length > 2000 || !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(link)) return { error: 'Paste the full link of the blog (starting with https://)' };
  }

  try {
    const db = await getDb();
    const row = await db.prepare(`
      SELECT a.id, a.submitted_at, a.item_links, t.checklist, t.kind, t.due_date, t.due_time
      FROM manager_task_assignees a JOIN manager_tasks t ON t.id = a.task_id
      WHERE a.task_id = ? AND a.user_id = ?
    `).get(id, session.userId);
    if (!row || row.kind !== 'client_blog') return { error: 'This task is not assigned to you' };
    if (row.submitted_at) return { error: 'This task is already done' };

    let clients = [];
    try { clients = JSON.parse(row.checklist || '[]'); } catch { clients = []; }
    if (!Array.isArray(clients) || idx >= clients.length) return { error: 'Invalid client' };

    let links = {};
    try { links = JSON.parse(row.item_links || '{}') || {}; } catch { links = {}; }
    if (link) links[idx] = link; else delete links[idx];

    const doneIdx = clients.map((_, i) => i).filter((i) => links[i]);
    await db.prepare('UPDATE manager_task_assignees SET item_links = ?, checklist_done = ? WHERE id = ?')
      .run(JSON.stringify(links), JSON.stringify(doneIdx), row.id);

    let submitted = false;
    if (doneIdx.length === clients.length && clients.length > 0) {
      const description = clients.map((name, i) => `${name}: ${links[i]}`).join('\n');
      const dueAt = new Date(`${row.due_date}T${row.due_time}:00`);
      const isLate = Number.isNaN(dueAt.getTime()) ? false : new Date() > dueAt;
      await db.prepare(`
        UPDATE manager_task_assignees
        SET submission_description = ?, submitted_at = CURRENT_TIMESTAMP, is_late = ?, late_reason = ?, approval_status = ?
        WHERE id = ?
      `).run(description, isLate ? 1 : 0, isLate ? 'Last blog link was added after the due time' : null, isLate ? 'pending' : null, row.id);
      submitted = true;
    }

    revalidatePath('/web-seo-manager/tasks');
    revalidatePath('/admin/manager-tasks');
    return { success: true, submitted };
  } catch (err) {
    console.error('[ManagerTasks] setClientBlogLink failed:', err);
    return { error: 'Could not save — please try again.' };
  }
}
