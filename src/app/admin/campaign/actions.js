'use server';

import { getDb } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createCampaign(prevState, formData) {
  const db = await getDb();
  
  const name = formData.get('name');
  const total_days = parseInt(formData.get('total_days')) || 16;
  const start_date = formData.get('start_date');
  const clients_per_day = parseInt(formData.get('clients_per_day')) || 4;
  const links_per_client = parseInt(formData.get('links_per_client')) || 50;
  const web2_target = parseInt(formData.get('web2_target')) || 7;
  const guestpost_target = parseInt(formData.get('guestpost_target')) || 7;
  const pdf_target = parseInt(formData.get('pdf_target')) || 7;
  const profile_target = parseInt(formData.get('profile_target')) || 10;
  const citation_target = parseInt(formData.get('citation_target')) || 10;
  const image_target = parseInt(formData.get('image_target')) || 9;
  const writer_approach = parseInt(formData.get('writer_approach')) || 1;
  const writers_daily_target = parseInt(formData.get('writers_daily_target')) || 105;
  const posts_per_client = parseInt(formData.get('posts_per_client')) || 21;
  const writer_clients_per_day = parseInt(formData.get('writer_clients_per_day')) || 8;

  try {
    await db.prepare(`
      INSERT INTO campaigns (name, total_days, start_date, clients_per_day,
        links_per_client, web2_target, guestpost_target, pdf_target,
        profile_target, citation_target, image_target,
        writer_approach, writers_daily_target, posts_per_client, writer_clients_per_day, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      name, total_days, start_date, clients_per_day,
      links_per_client, web2_target, guestpost_target,
      pdf_target, profile_target, citation_target,
      image_target, writer_approach, writers_daily_target,
      posts_per_client, writer_clients_per_day
    );

    revalidatePath('/admin/campaign');
    revalidatePath('/admin');
    return { success: 'Campaign created successfully' };
  } catch (err) {
    return { error: err.message };
  }
}

export async function updateCampaign(prevState, formData) {
  const db = await getDb();
  const id = formData.get('id');
  
  const name = formData.get('name');
  const total_days = parseInt(formData.get('total_days')) || 16;
  const start_date = formData.get('start_date');
  const clients_per_day = parseInt(formData.get('clients_per_day')) || 4;
  const status = formData.get('status') || 'active';
  
  const web2_target = parseInt(formData.get('web2_target')) || 0;
  const guestpost_target = parseInt(formData.get('guestpost_target')) || 0;
  const pdf_target = parseInt(formData.get('pdf_target')) || 0;
  const profile_target = parseInt(formData.get('profile_target')) || 0;
  const citation_target = parseInt(formData.get('citation_target')) || 0;
  const image_target = parseInt(formData.get('image_target')) || 0;
  const writer_approach = parseInt(formData.get('writer_approach')) || 1;
  const writers_daily_target = parseInt(formData.get('writers_daily_target')) || 105;
  const posts_per_client = parseInt(formData.get('posts_per_client')) || 21;
  const writer_clients_per_day = parseInt(formData.get('writer_clients_per_day')) || 8;

  try {
    await db.prepare(`
      UPDATE campaigns SET name=?, total_days=?, start_date=?, clients_per_day=?,
        web2_target=?, guestpost_target=?, pdf_target=?,
        profile_target=?, citation_target=?, image_target=?,
        writer_approach=?, writers_daily_target=?, posts_per_client=?,
        writer_clients_per_day=?, status=?
      WHERE id=?
    `).run(
      name, total_days, start_date, clients_per_day,
      web2_target, guestpost_target, pdf_target,
      profile_target, citation_target, image_target,
      writer_approach, writers_daily_target, posts_per_client,
      writer_clients_per_day, status, id
    );

    revalidatePath('/admin/campaign');
    revalidatePath('/admin');
    return { success: 'Campaign updated successfully' };
  } catch (err) {
    return { error: err.message };
  }
}

export async function activateCampaign(id) {
  const db = await getDb();
  try {
    await db.prepare("UPDATE campaigns SET status = 'paused' WHERE status = 'active'").run();
    await db.prepare("UPDATE campaigns SET status = 'active' WHERE id = ?").run(id);
    
    revalidatePath('/admin/campaign');
    revalidatePath('/admin');
    return { success: 'Campaign activated' };
  } catch (err) {
    return { error: err.message };
  }
}

// Manual only — no automatic date-based completion. Just flips status; doesn't
// touch clients, tasks, or any other data, so a completed campaign's real
// numbers stay intact and viewable on its detail page (/admin/campaign/[id]).
export async function markCampaignCompleted(id) {
  const db = await getDb();
  try {
    await db.prepare("UPDATE campaigns SET status = 'completed' WHERE id = ?").run(id);

    revalidatePath('/admin/campaign');
    revalidatePath('/admin');
    return { success: 'Campaign marked as completed' };
  } catch (err) {
    return { error: err.message };
  }
}

export async function deleteCampaign(id) {
  const db = await getDb();
  try {
    // Delete all related data in cascading order. writing_tasks/writer_assignments
    // are the retired legacy writer pipeline (superseded by the independent
    // writer_campaigns/writer_offpage_* tables, which aren't touched by an SEO
    // campaign's deletion) — nothing left to cascade there.
    // First delete all seo_tasks
    await db.prepare('DELETE FROM seo_tasks WHERE campaign_id = ?').run(id);

    // Delete all associate_assignments
    await db.prepare('DELETE FROM associate_assignments WHERE campaign_id = ?').run(id);

    // Delete all clients
    await db.prepare('DELETE FROM clients WHERE campaign_id = ?').run(id);
    
    // Finally delete the campaign
    await db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
    
    revalidatePath('/admin/campaign');
    revalidatePath('/admin');
    return { success: 'Campaign deleted successfully' };
  } catch (err) {
    return { error: err.message };
  }
}
