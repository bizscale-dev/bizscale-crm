'use server';

import { getDb } from '@/lib/db';
import { runWriterOffpageSync } from '@/lib/writerOffpageSync';
import { getActiveCampaign } from '@/lib/services';
import { revalidatePath } from 'next/cache';

// Manually re-triggers the GBP-Off Page / Web-Off Page sheet sync (see
// writerOffpageSync.js) — same logic the twice-daily cron runs, exposed here so an
// admin doesn't have to wait for the next scheduled run.
export async function regenerateWriterTasks() {
  const campaign = await getActiveCampaign();

  if (!campaign) {
    return { error: 'No active campaign found' };
  }

  try {
    const result = await runWriterOffpageSync(campaign.id);
    revalidatePath('/writer/tasks');
    revalidatePath('/writer');
    revalidatePath('/admin/writers');

    const failed = Object.entries(result).filter(([, r]) => !r.success);
    const summary = Object.entries(result)
      .map(([type, r]) => r.success ? `${type}: ${r.clientCount} clients, ${r.taskCount} tasks` : `${type}: failed (${r.error})`)
      .join('; ');

    if (failed.length > 0) return { error: summary };
    return { success: summary };
  } catch (err) {
    console.error('Error syncing writer off-page tasks:', err);
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
    await db.prepare('DELETE FROM writer_offpage_tasks WHERE campaign_id = ?').run(campaign.id);
    revalidatePath('/writer/tasks');
    revalidatePath('/writer');
    revalidatePath('/admin/writers');
    return { success: 'GBP-Off/Web-Off writer tasks cleared successfully' };
  } catch (err) {
    return { error: err.message };
  }
}
