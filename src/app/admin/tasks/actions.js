'use server';

import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import { generateSEOTasks } from '@/lib/taskService';
import { generateWebSeoTasks } from '@/lib/webSeoTaskGenerator';
import { revalidatePath } from 'next/cache';

export async function generateSEO() {
  const campaign = await getActiveCampaign();
  if (!campaign) return { error: 'No active campaign' };

  try {
    const count = await generateSEOTasks(campaign.id);
    revalidatePath('/admin/tasks');
    return { success: `${count} SEO tasks generated` };
  } catch (err) {
    return { error: err.message };
  }
}

export async function generateAll() {
  const campaign = await getActiveCampaign();
  if (!campaign) return { error: 'No active campaign' };

  try {
    const seoCount = await generateSEOTasks(campaign.id);
    revalidatePath('/admin/tasks');
    return { success: `${seoCount} SEO tasks generated` };
  } catch (err) {
    return { error: err.message };
  }
}

export async function generateWebSeo() {
  const campaign = await getActiveCampaign();
  if (!campaign) return { error: 'No active campaign' };

  try {
    const result = await generateWebSeoTasks(campaign.id);
    revalidatePath('/admin/tasks');
    revalidatePath('/admin/web-seo-associates');
    return { success: `${result.taskCount} Web SEO tasks generated for ${result.associateCount} associate(s)` };
  } catch (err) {
    return { error: err.message };
  }
}

export async function clearWebSeo() {
  const db = await getDb();
  const campaign = await getActiveCampaign();
  if (!campaign) return { error: 'No active campaign' };

  try {
    await db.prepare('DELETE FROM webseo_tasks WHERE campaign_id = ?').run(campaign.id);
    revalidatePath('/admin/tasks');
    revalidatePath('/admin/web-seo-associates');
    return { success: 'Web SEO tasks cleared' };
  } catch (err) {
    return { error: err.message };
  }
}

export async function clearSEO() {
  const db = await getDb();
  const campaign = await getActiveCampaign();
  if (!campaign) return { error: 'No active campaign' };

  try {
    await db.prepare('DELETE FROM seo_tasks WHERE campaign_id = ?').run(campaign.id);
    revalidatePath('/admin/tasks');
    return { success: 'SEO tasks cleared' };
  } catch (err) {
    return { error: err.message };
  }
}

export async function clearWriting() {
  const db = await getDb();
  const campaign = await getActiveCampaign();
  if (!campaign) return { error: 'No active campaign' };

  try {
    await db.prepare('DELETE FROM writing_tasks WHERE campaign_id = ?').run(campaign.id);
    revalidatePath('/admin/tasks');
    return { success: 'Writing tasks cleared' };
  } catch (err) {
    return { error: err.message };
  }
}
