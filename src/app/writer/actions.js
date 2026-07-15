'use server';

import { getDb } from '@/lib/db';
import { importClientsFromSheetFormData, insertClients } from '@/lib/clientImport';
import { getActiveCampaign } from '@/lib/services';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';

async function requireAssignedWriter() {
  const session = await verifySession();
  if (!session || session.role !== 'writer') {
    return { error: 'Not authorized' };
  }

  const campaign = await getActiveCampaign();
  if (!campaign) return { error: 'No active campaign' };

  const db = await getDb();
  const assignment = await db
    .prepare('SELECT id FROM writer_assignments WHERE campaign_id = ? AND user_id = ?')
    .get(campaign.id, session.userId);

  if (!assignment) {
    return { error: 'You are not assigned to the active campaign' };
  }

  return { session, campaign, db };
}

export async function importClientsFromGoogleSheet(prevState, formData) {
  const access = await requireAssignedWriter();
  if (access.error) return { error: access.error };

  const result = await importClientsFromSheetFormData(formData);
  if (result.error) return { error: result.error };

  try {
    const count = await insertClients(access.db, access.campaign.id, result.clients);
    revalidatePath('/writer/clients');
    revalidatePath('/writer');
    return { success: `${count} clients imported from Google Sheet` };
  } catch (err) {
    return { error: err.message };
  }
}

export async function logPost(prevState, formData) {
  const db = await getDb();
  const session = await verifySession();
  if (!session) return { error: 'Not authenticated' };

  const taskId = formData.get('taskId');
  const title = formData.get('title')?.trim();
  const url = formData.get('url') || '';
  const word_count = parseInt(formData.get('word_count')) || 0;
  const notes = formData.get('notes') || '';

  if (!title) return { error: 'Title is required' };

  const task = await db.prepare('SELECT * FROM writing_tasks WHERE id = ? AND writer_id = ?').get(taskId, session.userId);
  if (!task) return { error: 'Task not found or not authorized' };

  try {
    await db.prepare('INSERT INTO writing_logs (task_id, title, url, word_count, notes, logged_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(taskId, title, url, word_count, notes, session.userId);

    const logCount = (await db.prepare('SELECT COUNT(*) as c FROM writing_logs WHERE task_id = ?').get(taskId)).c;
    await db.prepare('UPDATE writing_tasks SET completed_count = ? WHERE id = ?').run(logCount, taskId);

    revalidatePath('/writer/tasks');
    revalidatePath('/writer');
    return { success: true, completed: logCount, target: task.target_count };
  } catch (err) {
    return { error: err.message };
  }
}

export async function deletePost(logId) {
  const db = await getDb();
  const session = await verifySession();
  if (!session) return { error: 'Not authenticated' };

  const log = await db.prepare(`
    SELECT wl.*, wt.writer_id FROM writing_logs wl
    JOIN writing_tasks wt ON wt.id = wl.task_id
    WHERE wl.id = ?
  `).get(logId);

  if (!log || log.writer_id !== session.userId) return { error: 'Not authorized' };

  try {
    await db.prepare('DELETE FROM writing_logs WHERE id = ?').run(logId);
    const logCount = (await db.prepare('SELECT COUNT(*) as c FROM writing_logs WHERE task_id = ?').get(log.task_id)).c;
    await db.prepare('UPDATE writing_tasks SET completed_count = ? WHERE id = ?').run(logCount, log.task_id);

    revalidatePath('/writer/tasks');
    revalidatePath('/writer/logs');
    revalidatePath('/writer');
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
}
