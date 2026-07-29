'use server';

import { getDb } from '@/lib/db';
import { runWriterOffpageSync } from '@/lib/writerOffpageSync';
import { getActiveCampaign, getActiveWriterCampaign } from '@/lib/services';
import { listOffDays, toggleOffDay } from '@/lib/writerCampaignOffDays';
import { revalidatePath } from 'next/cache';

// Creates a new, independent Writer Campaign — its own start_date/total_days,
// decoupled from the main campaigns table, so writers can be given a head start
// (e.g. a week early) before the associate-facing campaign is created. Client
// matching still borrows the currently active main campaign's roster, captured
// once as source_campaign_id.
export async function createWriterCampaign(prevState, formData) {
  const db = await getDb();

  const start_date = formData.get('start_date');
  const total_days = parseInt(formData.get('total_days')) || 16;

  if (!start_date) {
    return { error: 'Start date is required' };
  }

  const campaign = await getActiveCampaign();
  if (!campaign) {
    return { error: 'No active campaign found — a main campaign must exist so the writer campaign can match its clients' };
  }

  try {
    await db.prepare("UPDATE writer_campaigns SET status = 'completed' WHERE status = 'active'").run();

    const result = await db.prepare(`
      INSERT INTO writer_campaigns (source_campaign_id, start_date, total_days, status)
      VALUES (?, ?, ?, 'active')
    `).run(campaign.id, start_date, total_days);

    const writerCampaignId = result.lastInsertRowid;

    let syncSummary = '';
    try {
      const syncResult = await runWriterOffpageSync(writerCampaignId);
      syncSummary = Object.entries(syncResult)
        .map(([type, r]) => r.success ? `${type}: ${r.clientCount} clients, ${r.taskCount} tasks` : `${type}: failed (${r.error})`)
        .join('; ');
    } catch (syncErr) {
      syncSummary = `sync failed: ${syncErr.message}`;
    }

    revalidatePath('/admin/writers');
    revalidatePath('/writer');
    revalidatePath('/writer/tasks');
    return { success: `Writer campaign started. ${syncSummary}` };
  } catch (err) {
    return { error: err.message };
  }
}

export async function deleteWriterCampaign(id) {
  const db = await getDb();
  try {
    await db.prepare('DELETE FROM writer_offpage_tasks WHERE writer_campaign_id = ?').run(id);
    await db.prepare('DELETE FROM writer_offpage_assignments WHERE writer_campaign_id = ?').run(id);
    await db.prepare('DELETE FROM writer_campaign_off_days WHERE writer_campaign_id = ?').run(id);
    await db.prepare('DELETE FROM writer_campaigns WHERE id = ?').run(id);

    revalidatePath('/admin/writers');
    revalidatePath('/writer');
    revalidatePath('/writer/tasks');
    return { success: 'Writer campaign deleted' };
  } catch (err) {
    return { error: err.message };
  }
}

// Manually re-triggers the GBP-Off Page / Web-Off Page sheet sync (see
// writerOffpageSync.js) — same logic the twice-daily cron runs, exposed here so an
// admin doesn't have to wait for the next scheduled run.
export async function regenerateWriterTasks() {
  const writerCampaign = await getActiveWriterCampaign();

  if (!writerCampaign) {
    return { error: 'No active writer campaign found — start one first' };
  }

  try {
    const result = await runWriterOffpageSync(writerCampaign.id);
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
  const writerCampaign = await getActiveWriterCampaign();

  if (!writerCampaign) {
    return { error: 'No active writer campaign found' };
  }

  try {
    await db.prepare('DELETE FROM writer_offpage_tasks WHERE writer_campaign_id = ?').run(writerCampaign.id);
    revalidatePath('/writer/tasks');
    revalidatePath('/writer');
    revalidatePath('/admin/writers');
    return { success: 'GBP-Off/Web-Off writer tasks cleared successfully' };
  } catch (err) {
    return { error: err.message };
  }
}

export async function getOffDaysForActiveWriterCampaignAction() {
  const writerCampaign = await getActiveWriterCampaign();
  if (!writerCampaign) return [];

  const rows = await listOffDays(writerCampaign.id);
  return rows.map(r => r.off_date);
}

export async function toggleWriterCampaignOffDayAction(dateStr, reason = null) {
  const writerCampaign = await getActiveWriterCampaign();
  if (!writerCampaign) return { error: 'No active writer campaign found' };

  try {
    const result = await toggleOffDay(writerCampaign.id, dateStr, reason);
    revalidatePath('/admin/writers');
    return result;
  } catch (err) {
    return { error: err.message };
  }
}
