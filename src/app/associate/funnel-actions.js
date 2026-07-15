'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';

export async function toggleFunnelTaskAction(taskId) {
  const db = await getDb();
  const session = await verifySession();
  if (!session || session.role !== 'seo_associate') return { error: 'Not authenticated' };

  const task = await db.prepare(`
    SELECT tt.*, c.assigned_associate_id
    FROM tunnel_tasks tt
    JOIN clients c ON c.id = tt.client_id
    WHERE tt.id = ?
  `).get(taskId);

  if (!task || task.assigned_associate_id !== session.userId) {
    return { error: 'Not authorized' };
  }

  const newStatus = task.status === 'completed' ? 'pending' : 'completed';

  await db.prepare(`
    UPDATE tunnel_tasks SET status = ?, completed_at = ? WHERE id = ?
  `).run(newStatus, newStatus === 'completed' ? new Date().toISOString() : null, taskId);

  revalidatePath('/associate');

  return { success: true, status: newStatus };
}
