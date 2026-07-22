'use server';

import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import { generateWebSeoTasks } from '@/lib/webSeoTaskGenerator';
import { runWebClientsImport } from '@/lib/webClientsImport';
import { revalidatePath } from 'next/cache';

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
    const campaign = await getActiveCampaign();

    if (!campaign) {
      return { error: 'No active campaign' };
    }

    // Verify client belongs to this campaign
    const client = await db.prepare(`
      SELECT id FROM web_clients 
      WHERE id = ? AND campaign_id = ?
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
