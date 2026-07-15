'use server';

import { getActiveCampaign } from '@/lib/services';
import { verifySession } from '@/lib/session';
import { listOffDays, toggleOffDay } from '@/lib/offDays';
import { revalidatePath } from 'next/cache';

export async function getOffDaysForActiveCampaignAction() {
  const session = await verifySession();
  if (!session || session.role !== 'admin') return { error: 'Not authorized' };

  const campaign = await getActiveCampaign();
  if (!campaign) return { offDays: [] };

  return { offDays: (await listOffDays(campaign.id)).map(d => d.off_date) };
}

export async function toggleOffDayAction(dateStr, reason) {
  const session = await verifySession();
  if (!session || session.role !== 'admin') return { error: 'Not authorized' };

  const campaign = await getActiveCampaign();
  if (!campaign) return { error: 'No active campaign' };

  try {
    const result = await toggleOffDay(campaign.id, dateStr, reason || null);
    revalidatePath('/admin');
    return { success: true, offDay: result.offDay };
  } catch (err) {
    return { error: err.message };
  }
}
