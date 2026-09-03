'use server';

import { getDb } from '@/lib/db';
import { getActiveWebSeoCampaign } from '@/lib/services';
import { generateWebSeoTasks } from '@/lib/webSeoTaskGenerator';
import { runWebClientsImport } from '@/lib/webClientsImport';
import { toggleOffDay } from '@/lib/webSeoCampaignOffDays';
import { revalidatePath } from 'next/cache';

export async function toggleWebSeoCampaignOffDayAction(dateStr, reason = null) {
  const campaign = await getActiveWebSeoCampaign();
  if (!campaign) return { error: 'No active Web SEO campaign found' };

  try {
    const result = await toggleOffDay(campaign.id, dateStr, reason);
    revalidatePath('/admin/web-clients');
    return result;
  } catch (err) {
    return { error: err.message };
  }
}

// Starts a new, independent Web SEO campaign — its own start_date/total_days,
// fully decoupled from the main (SEO) campaigns table (see webseo_campaigns in
// src/lib/db.js). Creating one auto-completes whichever Web SEO campaign was
// previously active, same UX as Writer Campaigns.
export async function createWebSeoCampaign(prevState, formData) {
  const db = await getDb();

  const name = (formData.get('name') || '').trim() || 'Web SEO Campaign';
  const start_date = formData.get('start_date');
  const total_days = parseInt(formData.get('total_days')) || 16;
  const webseo_web2_target = parseInt(formData.get('webseo_web2_target')) || 7;
  const webseo_guestpost_target = parseInt(formData.get('webseo_guestpost_target')) || 7;

  if (!start_date) {
    return { error: 'Start date is required' };
  }

  try {
    await db.prepare("UPDATE webseo_campaigns SET status = 'completed' WHERE status = 'active'").run();

    await db.prepare(`
      INSERT INTO webseo_campaigns (name, start_date, total_days, status, webseo_web2_target, webseo_guestpost_target)
      VALUES (?, ?, ?, 'active', ?, ?)
    `).run(name, start_date, total_days, webseo_web2_target, webseo_guestpost_target);

    revalidatePath('/admin/web-clients');
    revalidatePath('/admin/web-seo-associates');
    revalidatePath('/admin');
    return { success: 'Web SEO campaign started' };
  } catch (err) {
    return { error: err.message };
  }
}

export async function deleteWebSeoCampaign(id) {
  const db = await getDb();
  try {
    await db.prepare('DELETE FROM webseo_tasks WHERE webseo_campaign_id = ?').run(id);
    await db.prepare('DELETE FROM web_clients WHERE webseo_campaign_id = ?').run(id);
    await db.prepare('DELETE FROM webseo_campaign_off_days WHERE webseo_campaign_id = ?').run(id);
    await db.prepare('DELETE FROM webseo_campaigns WHERE id = ?').run(id);

    revalidatePath('/admin/web-clients');
    revalidatePath('/admin/web-seo-associates');
    revalidatePath('/admin');
    return { success: 'Web SEO campaign deleted' };
  } catch (err) {
    return { error: err.message };
  }
}

export async function importWebClientsFromGoogleSheet(formData) {
  try {
    const sheetUrl = formData.get('sheet_url');
    const result = await runWebClientsImport(sheetUrl);

    revalidatePath('/admin/web-clients');
    revalidatePath('/admin/web-seo-associates');
    revalidatePath('/admin');

    return {
      success: true,
      message: result.message
    };
  } catch (error) {
    console.error('[importWebClientsFromGoogleSheet] Exception:', error);
    return { error: error.message || 'Unknown error occurred' };
  }
}

export async function assignWebAssociate(clientId, associateId) {
  try {
    const db = await getDb();
    const campaign = await getActiveWebSeoCampaign();

    if (!campaign) {
      return { error: 'No active Web SEO campaign' };
    }

    // Verify client belongs to this campaign
    const client = await db.prepare(`
      SELECT id FROM web_clients
      WHERE id = ? AND webseo_campaign_id = ?
    `).get(clientId, campaign.id);

    if (!client) {
      return { error: 'Client not found' };
    }

    // Verify associate exists and has web_seo_associate role
    const associate = await db.prepare(`
      SELECT id FROM users 
      WHERE id = ? AND role = 'web_seo_associate'
    `).get(associateId);

    if (!associate) {
      return { error: 'Web SEO Associate not found' };
    }

    // Update assignment
    await db.prepare(`
      UPDATE web_clients
      SET assigned_associate_id = ?
      WHERE id = ?
    `).run(associateId, clientId);

    // Regenerate the batch-rotation task schedule now that assignments changed
    try {
      await generateWebSeoTasks(campaign.id);
    } catch (genErr) {
      console.error('[assignWebAssociate] Failed to regenerate web SEO tasks:', genErr.message);
    }

    revalidatePath('/admin/web-clients');
    revalidatePath('/admin/web-seo-associates');
    revalidatePath('/admin');

    return { success: true, message: 'Associate assigned successfully' };
  } catch (error) {
    console.error('Assignment error:', error);
    return { error: error.message };
  }
}
