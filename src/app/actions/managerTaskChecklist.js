'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';

const MANAGER_ROLES = ['seo_manager', 'web_seo_manager', 'writers_manager'];
const PORTAL_PATHS = {
  seo_manager: '/seo-manager/tasks',
  web_seo_manager: '/web-seo-manager/tasks',
  writers_manager: '/writers-manager/tasks',
};

/**
 * Ticks or unticks one item of a checklist task for the signed-in manager.
 * Only their own assignment can be changed, and only until they've submitted it.
 */
export async function setChecklistItem(taskId, index, checked) {
  const session = await verifySession();
  if (!session || !MANAGER_ROLES.includes(session.role)) return { error: 'Not authorized' };

  const id = parseInt(taskId, 10);
  const idx = parseInt(index, 10);
  if (!id || Number.isNaN(idx) || idx < 0) return { error: 'Invalid item' };

  try {
    const db = await getDb();
    const row = await db.prepare(`
      SELECT a.id, a.submitted_at, a.checklist_done, t.checklist
      FROM manager_task_assignees a JOIN manager_tasks t ON t.id = a.task_id
      WHERE a.task_id = ? AND a.user_id = ?
    `).get(id, session.userId);
    if (!row) return { error: 'This task is not assigned to you' };
    if (row.submitted_at) return { error: 'This task is already submitted' };

    let items = [];
    try { items = JSON.parse(row.checklist || '[]'); } catch { items = []; }
    if (!Array.isArray(items) || idx >= items.length) return { error: 'Invalid item' };

    let done = [];
    try { done = JSON.parse(row.checklist_done || '[]'); } catch { done = []; }
    const set = new Set(Array.isArray(done) ? done : []);
    if (checked) set.add(idx); else set.delete(idx);

    await db.prepare('UPDATE manager_task_assignees SET checklist_done = ? WHERE id = ?')
      .run(JSON.stringify([...set].sort((a, b) => a - b)), row.id);

    revalidatePath(PORTAL_PATHS[session.role]);
    revalidatePath('/admin/manager-tasks');
    return { success: true };
  } catch (err) {
    console.error('[ManagerTasks] setChecklistItem failed:', err);
    return { error: 'Could not save — please try again.' };
  }
}
