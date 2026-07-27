'use server';

import { getDb } from '@/lib/db';
import { generateWriterTasks } from '@/lib/writerTaskGenerator';
import { generateWebSeoTasks } from '@/lib/webSeoTaskGenerator';
import { getActiveCampaign } from '@/lib/services';
import { revalidatePath } from 'next/cache';

// Sets/clears which Web SEO Associate a writer mirrors for "Web Tasks" (see
// webSeoTaskGenerator.js) and immediately regenerates so the writer's mirrored task
// list reflects the change right away instead of waiting for the next sync/regen.
export async function setWriterMirrorsAssociate(writerId, associateId) {
  const db = await getDb();
  const campaign = await getActiveCampaign();
  if (!campaign) return { error: 'No active campaign found' };

  try {
    await db.prepare('UPDATE users SET mirrors_web_associate_id = ? WHERE id = ? AND role = ?')
      .run(associateId || null, writerId, 'writer');

    await generateWebSeoTasks(campaign.id);

    revalidatePath('/admin/writers');
    revalidatePath('/writer/web-tasks');
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
}

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
