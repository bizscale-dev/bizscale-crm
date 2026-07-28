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

