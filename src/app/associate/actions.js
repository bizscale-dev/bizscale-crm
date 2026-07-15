'use server';

import { getDb } from '@/lib/db';
import { importClientsFromSheetFormData, insertClients } from '@/lib/clientImport';
import { getActiveCampaign } from '@/lib/services';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';

async function requireAssignedAssociate() {
  const session = await verifySession();
  if (!session || session.role !== 'seo_associate') {
    return { error: 'Not authorized' };
  }

  const campaign = await getActiveCampaign();
  if (!campaign) return { error: 'No active campaign' };

  const db = await getDb();
  const assignment = await db
    .prepare('SELECT id FROM associate_assignments WHERE campaign_id = ? AND user_id = ?')
    .get(campaign.id, session.userId);

  if (!assignment) {
    return { error: 'You are not assigned to the active campaign' };
  }

  return { session, campaign, db };
}

export async function importClientsFromGoogleSheet(prevState, formData) {
  const access = await requireAssignedAssociate();
  if (access.error) return { error: access.error };

  const result = await importClientsFromSheetFormData(formData);
  if (result.error) return { error: result.error };

  try {
    const count = await insertClients(access.db, access.campaign.id, result.clients);
    revalidatePath('/associate/clients');
    revalidatePath('/associate');
    return { success: `${count} clients imported from Google Sheet` };
  } catch (err) {
    return { error: err.message };
  }
}

export async function logLink(prevState, formData) {
  const db = await getDb();
  const session = await verifySession();
  if (!session) return { error: 'Not authenticated' };

  const taskId = formData.get('taskId');
  const url = formData.get('url')?.trim();
  const anchor_text = formData.get('anchor_text') || '';
  const notes = formData.get('notes') || '';

  if (!url) return { error: 'URL is required' };

  const task = await db.prepare('SELECT * FROM seo_tasks WHERE id = ? AND associate_id = ?').get(taskId, session.userId);
  if (!task) return { error: 'Task not found or not authorized' };

  try {
    await db.prepare('INSERT INTO link_logs (task_id, url, anchor_text, notes, logged_by) VALUES (?, ?, ?, ?, ?)')
      .run(taskId, url, anchor_text, notes, session.userId);

    const logCount = (await db.prepare('SELECT COUNT(*) as c FROM link_logs WHERE task_id = ?').get(taskId)).c;
    await db.prepare('UPDATE seo_tasks SET completed_count = ? WHERE id = ?').run(logCount, taskId);

    revalidatePath('/associate/tasks');
    revalidatePath('/associate');
    return { success: true, completed: logCount, target: task.target_count };
  } catch (err) {
    return { error: err.message };
  }
}

export async function deleteLink(logId) {
  const db = await getDb();
  const session = await verifySession();
  if (!session) return { error: 'Not authenticated' };

  const log = await db.prepare(`
    SELECT ll.*, st.associate_id, st.target_count
    FROM link_logs ll JOIN seo_tasks st ON st.id = ll.task_id
    WHERE ll.id = ?
  `).get(logId);

  if (!log || log.associate_id !== session.userId) return { error: 'Not authorized' };

  try {
    await db.prepare('DELETE FROM link_logs WHERE id = ?').run(logId);
    const logCount = (await db.prepare('SELECT COUNT(*) as c FROM link_logs WHERE task_id = ?').get(log.task_id)).c;
    await db.prepare('UPDATE seo_tasks SET completed_count = ? WHERE id = ?').run(logCount, log.task_id);

    revalidatePath('/associate/tasks');
    revalidatePath('/associate/logs');
    revalidatePath('/associate');
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
}
