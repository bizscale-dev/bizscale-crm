'use server';

import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import { revalidatePath } from 'next/cache';

export async function triggerManualSync(campaignId) {
  try {
    const db = await getDb();
    
    let campaign = null;
    if (campaignId) {
      campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    } else {
      campaign = await getActiveCampaign();
    }

    if (!campaign) {
      return { error: 'No active campaign found' };
    }

    // Get saved sheet URL
    const settings = await db.prepare("SELECT value FROM settings WHERE key = 'google_sheets_url'").get();
    if (!settings) {
      return { error: 'Google Sheets URL not configured. Please configure it in settings.' };
    }

    const sheetUrl = settings.value;

    // Call sync endpoint
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const syncResponse = await fetch(`${baseUrl}/api/google-sheets/sync-clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetUrl, campaignId: campaign.id }),
    });

    if (!syncResponse.ok) {
      const errorData = await syncResponse.json();
      return { error: errorData.error || 'Sync failed' };
    }

    const syncData = await syncResponse.json();

    // Apply changes (including writers and associates)
    if (syncData.changes) {
      const applyResponse = await fetch(`${baseUrl}/api/google-sheets/sync-apply-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          changes: syncData.changes,
          campaignId: campaign.id,
          associateAssignments: syncData.associateAssignments,
          writerAssignments: syncData.writerAssignments,
        }),
      });

      if (!applyResponse.ok) {
        console.error('Failed to apply changes');
      }
    }

    // Assign new clients
    if (syncData.changes && syncData.changes.added && syncData.changes.added.length > 0) {
      const assignResponse = await fetch(`${baseUrl}/api/google-sheets/sync-assign-new-clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          newClients: syncData.changes.added,
          associateAssignments: syncData.associateAssignments,
          writerAssignments: syncData.writerAssignments,
          campaignId: campaign.id
        }),
      });

      if (!assignResponse.ok) {
        console.error('Failed to assign clients');
      } else {
        const assignData = await assignResponse.json();
        console.log('Clients assigned:', assignData);
      }
    }

    revalidatePath('/admin/clients');
    revalidatePath('/admin');

    return {
      success: true,
      message: `Synced successfully! ${syncData.changes.added.length} new clients, ${syncData.changes.deactivated.length} deactivated`,
      data: syncData,
    };
  } catch (error) {
    console.error('Manual sync error:', error);
    return { error: error.message };
  }
}

export async function createClient(formData) {
  const db = await getDb();
  const campaign = await getActiveCampaign();

  if (!campaign) {
    return { error: 'No active campaign' };
  }

  try {
    const name = formData.get('name')?.trim();
    const website = formData.get('website')?.trim();
    const niche = formData.get('niche')?.trim();
    const notes = formData.get('notes')?.trim();
    let sortOrder = formData.get('sort_order')?.trim();

    if (!name) {
      return { error: 'Client name is required' };
    }

    // Auto-assign sort_order if not provided
    if (!sortOrder) {
      const result = await db.prepare('SELECT MAX(sort_order) as max_sort FROM clients WHERE campaign_id = ?').get(campaign.id);
      sortOrder = (result.max_sort || 0) + 1;
    } else {
      sortOrder = parseInt(sortOrder);
    }

    // tunnel_status = 'hold' — sits with zero tasks until manually placed into the
    // Funnel (or straight into the normal rotation) from /admin/funnel.
    const result = await db.prepare(`
      INSERT INTO clients (campaign_id, name, website, niche, sort_order, notes, is_active, tunnel_status)
      VALUES (?, ?, ?, ?, ?, ?, 1, 'hold')
    `).run(campaign.id, name, website || null, niche || null, sortOrder, notes || null);

    revalidatePath('/admin/clients');
    revalidatePath('/admin/funnel');
    return { success: 'Client added — on hold until placed into the Funnel or a client list' };
  } catch (error) {
    console.error('Create client error:', error);
    return { error: error.message };
  }
}

export async function updateClient(formData) {
  const db = await getDb();
  const campaign = await getActiveCampaign();

  if (!campaign) {
    return { error: 'No active campaign' };
  }

  try {
    const id = formData.get('id');
    const name = formData.get('name')?.trim();
    const website = formData.get('website')?.trim();
    const niche = formData.get('niche')?.trim();
    const notes = formData.get('notes')?.trim();
    const sortOrder = formData.get('sort_order')?.trim();

    if (!name) {
      return { error: 'Client name is required' };
    }

    await db.prepare(`
      UPDATE clients 
      SET name = ?, website = ?, niche = ?, notes = ?, sort_order = ?
      WHERE id = ? AND campaign_id = ?
    `).run(name, website || null, niche || null, notes || null, sortOrder || null, id, campaign.id);

    revalidatePath('/admin/clients');
    return { success: 'Client updated successfully' };
  } catch (error) {
    console.error('Update client error:', error);
    return { error: error.message };
  }
}

export async function bulkCreateClients(formData) {
  const db = await getDb();
  const campaign = await getActiveCampaign();

  if (!campaign) {
    return { error: 'No active campaign' };
  }

  try {
    const bulkData = formData.get('bulk_data')?.trim();
    if (!bulkData) {
      return { error: 'No data provided' };
    }

    const lines = bulkData.split('\n').filter(line => line.trim());
    let successCount = 0;
    let sortOrder = (await db.prepare('SELECT MAX(sort_order) as max_sort FROM clients WHERE campaign_id = ?').get(campaign.id)).max_sort || 0;

    for (const line of lines) {
      const [name, website] = line.split('\t').map(s => s.trim());
      if (name) {
        sortOrder++;
        await db.prepare(`
          INSERT INTO clients (campaign_id, name, website, sort_order, is_active)
          VALUES (?, ?, ?, ?, 1)
        `).run(campaign.id, name, website || null, sortOrder);
        successCount++;
      }
    }

    revalidatePath('/admin/clients');
    return { success: `Successfully imported ${successCount} client${successCount !== 1 ? 's' : ''}` };
  } catch (error) {
    console.error('Bulk create clients error:', error);
    return { error: error.message };
  }
}

export async function importClientsFromGoogleSheet(formData) {
  const db = await getDb();
  const campaign = await getActiveCampaign();

  if (!campaign) {
    return { error: 'No active campaign' };
  }

  try {
    const sheetUrl = formData.get('sheet_url')?.trim();
    const clientId = formData.get('client_id')?.trim();
    const clientSecret = formData.get('client_secret')?.trim();

    if (!sheetUrl || !clientId || !clientSecret) {
      return { error: 'Sheet URL and credentials are required' };
    }

    // Extract sheet ID from URL
    const sheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!sheetIdMatch) {
      return { error: 'Invalid Google Sheets URL' };
    }

    // For now, return a placeholder - the actual implementation would use Google Sheets API
    return { 
      success: 'Import functionality to be configured with your credentials',
      clientId,
      clientSecret 
    };
  } catch (error) {
    console.error('Import from Google Sheets error:', error);
    return { error: error.message };
  }
}

export async function deleteClient(clientId) {
  const db = await getDb();
  const campaign = await getActiveCampaign();

  if (!campaign) {
    return { error: 'No active campaign' };
  }

  try {
    // Delete all tasks for this client first
    await db.prepare('DELETE FROM seo_tasks WHERE client_id = ? AND campaign_id = ?')
      .run(clientId, campaign.id);

    // Delete all link logs for this client
    await db.prepare('DELETE FROM link_logs WHERE client_id = ? AND campaign_id = ?')
      .run(clientId, campaign.id);

    // Delete the client
    await db.prepare('DELETE FROM clients WHERE id = ? AND campaign_id = ?')
      .run(clientId, campaign.id);

    revalidatePath('/admin/clients');
    revalidatePath('/associate/tasks');

    return { success: true, message: 'Client deleted successfully' };
  } catch (error) {
    console.error('Delete client error:', error);
    return { error: error.message };
  }
}

export async function deactivateClient(clientId) {
  const db = await getDb();
  const campaign = await getActiveCampaign();

  if (!campaign) {
    return { error: 'No active campaign' };
  }

  try {
    // Mark client as inactive
    await db.prepare('UPDATE clients SET is_active = 0 WHERE id = ? AND campaign_id = ?')
      .run(clientId, campaign.id);

    // Delete all future tasks for this client (keep today and past)
    const today = new Date().toISOString().split('T')[0];
    await db.prepare(
      'DELETE FROM seo_tasks WHERE client_id = ? AND campaign_id = ? AND task_date > ?'
    ).run(clientId, campaign.id, today);

    revalidatePath('/admin/clients');
    revalidatePath('/associate/tasks');

    return { success: true, message: 'Client deactivated and future tasks removed' };
  } catch (error) {
    console.error('Deactivate client error:', error);
    return { error: error.message };
  }
}

export async function activateClient(clientId) {
  const db = await getDb();
  const campaign = await getActiveCampaign();

  if (!campaign) {
    return { error: 'No active campaign' };
  }

  try {
    // Mark client as active
    await db.prepare('UPDATE clients SET is_active = 1 WHERE id = ? AND campaign_id = ?')
      .run(clientId, campaign.id);

    revalidatePath('/admin/clients');
    revalidatePath('/associate/tasks');

    return { success: true, message: 'Client activated' };
  } catch (error) {
    console.error('Activate client error:', error);
    return { error: error.message };
  }
}

export async function clearAllClients() {
  const db = await getDb();
  const campaign = await getActiveCampaign();

  if (!campaign) {
    return { error: 'No active campaign' };
  }

  try {
    // Delete all link logs first
    await db.prepare('DELETE FROM link_logs WHERE campaign_id = ?').run(campaign.id);

    // Delete all tasks for this campaign
    await db.prepare('DELETE FROM seo_tasks WHERE campaign_id = ?').run(campaign.id);

    // Delete all clients for this campaign
    await db.prepare('DELETE FROM clients WHERE campaign_id = ?').run(campaign.id);

    revalidatePath('/admin/clients');
    revalidatePath('/associate/tasks');

    return { success: true, message: 'All clients cleared successfully' };
  } catch (error) {
    console.error('Clear all clients error:', error);
    return { error: error.message };
  }
}

export async function toggleClientActive(clientId, currentStatus) {
  const db = await getDb();
  const campaign = await getActiveCampaign();

  if (!campaign) {
    return { error: 'No active campaign' };
  }

  try {
    const newStatus = currentStatus ? 0 : 1;

    // Update client status
    await db.prepare('UPDATE clients SET is_active = ? WHERE id = ? AND campaign_id = ?')
      .run(newStatus, clientId, campaign.id);

    // If deactivating: delete all future tasks for this client
    if (newStatus === 0) {
      const today = new Date().toISOString().split('T')[0];
      await db.prepare(
        'DELETE FROM seo_tasks WHERE client_id = ? AND campaign_id = ? AND task_date >= ?'
      ).run(clientId, campaign.id, today);
    }

    revalidatePath('/admin/clients');
    revalidatePath('/associate/page');
    revalidatePath('/associate/tasks');

    return {
      success: true,
      message: newStatus ? 'Client activated' : 'Client deactivated and tasks removed',
      newStatus,
    };
  } catch (error) {
    console.error('Toggle client error:', error);
    return { error: error.message };
  }
}
