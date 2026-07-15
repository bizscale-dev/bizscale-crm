'use server';

import { getDb } from '@/lib/db';
import { generateWriterTasks } from '@/lib/writerTaskGenerator';
import { getActiveCampaign } from '@/lib/services';
import { revalidatePath } from 'next/cache';

export async function regenerateWriterTasks() {
  const db = await getDb();
  const campaign = await getActiveCampaign();

  if (!campaign) {
    return { error: 'No active campaign found' };
  }

  try {
    const result = await generateWriterTasks(campaign.id);
    revalidatePath('/writer/tasks');
    revalidatePath('/admin');
    return { success: `Writer tasks generated successfully: ${JSON.stringify(result.details)}` };
  } catch (err) {
    console.error('Error generating writer tasks:', err);
    return { error: err.message };
  }
}

export async function clearWriterTasks() {
  const db = await getDb();
  const campaign = await getActiveCampaign();

  if (!campaign) {
    return { error: 'No active campaign found' };
  }

  try {
    await db.prepare('DELETE FROM writing_tasks WHERE campaign_id = ?').run(campaign.id);
    revalidatePath('/writer/tasks');
    revalidatePath('/admin');
    return { success: 'Writer tasks cleared successfully' };
  } catch (err) {
    return { error: err.message };
  }
}
