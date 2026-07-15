'use server';

import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';

export async function createUser(prevState, formData) {
  const db = await getDb();
  const name = formData.get('name');
  const email = formData.get('email');
  const password = formData.get('password');
  const role = formData.get('role');

  try {
    const hash = bcrypt.hashSync(password, 10);
    await db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)').run(
      name, email.toLowerCase().trim(), hash, role
    );
    revalidatePath('/admin/users');
    revalidatePath('/admin');
    return { success: 'User created successfully' };
  } catch (err) {
    return { error: err.message };
  }
}

export async function updateUser(prevState, formData) {
  const db = await getDb();
  const id = formData.get('id');
  const name = formData.get('name');
  const email = formData.get('email');
  const role = formData.get('role');
  const is_active = formData.get('is_active') === 'on' || formData.get('is_active') === '1' ? 1 : 0;
  const new_password = formData.get('new_password');

  try {
    if (new_password && new_password.length >= 6) {
      const hash = bcrypt.hashSync(new_password, 10);
      await db.prepare('UPDATE users SET name=?, email=?, role=?, is_active=?, password=? WHERE id=?')
        .run(name, email.toLowerCase().trim(), role, is_active, hash, id);
    } else {
      await db.prepare('UPDATE users SET name=?, email=?, role=?, is_active=? WHERE id=?')
        .run(name, email.toLowerCase().trim(), role, is_active, id);
    }
    revalidatePath('/admin/users');
    revalidatePath('/admin');
    return { success: 'User updated successfully' };
  } catch (err) {
    return { error: err.message };
  }
}

export async function deleteUser(id) {
  const db = await getDb();
  try {
    // First delete all related records (due to foreign key constraints)
    // Delete associate assignments
    await db.prepare('DELETE FROM associate_assignments WHERE user_id = ?').run(id);
    
    // Delete writer assignments
    await db.prepare('DELETE FROM writer_assignments WHERE user_id = ?').run(id);
    
    // Delete SEO tasks assigned to this user
    await db.prepare('DELETE FROM seo_tasks WHERE associate_id = ?').run(id);
    
    // Delete writing tasks assigned to this user
    await db.prepare('DELETE FROM writing_tasks WHERE writer_id = ?').run(id);
    
    // Delete link logs created by this user
    await db.prepare('DELETE FROM link_logs WHERE logged_by = ?').run(id);
    
    // Delete writing logs created by this user
    await db.prepare('DELETE FROM writing_logs WHERE logged_by = ?').run(id);
    
    // Finally delete the user
    await db.prepare('DELETE FROM users WHERE id = ?').run(id);
    
    revalidatePath('/admin/users');
    revalidatePath('/admin');
    return { success: 'User deleted successfully' };
  } catch (err) {
    console.error('Delete user error:', err);
    return { error: err.message };
  }
}

export async function assignAssociate(formData) {
  const db = await getDb();
  const id = formData.get('id');
  const campaign = await getActiveCampaign();
  if (!campaign) return { error: 'No active campaign' };

  const client_group_start = parseInt(formData.get('client_group_start')) || 1;
  const client_group_end = parseInt(formData.get('client_group_end')) || 20;
  const daily_link_target = parseInt(formData.get('daily_link_target')) || 63;

  try {
    await db.prepare(`
      INSERT OR REPLACE INTO associate_assignments (campaign_id, user_id, client_group_start, client_group_end, daily_link_target)
      VALUES (?, ?, ?, ?, ?)
    `).run(campaign.id, id, client_group_start, client_group_end, daily_link_target);
    revalidatePath('/admin/users');
    return { success: 'Associate assigned to campaign' };
  } catch (err) {
    return { error: err.message };
  }
}

export async function assignWriter(formData) {
  const db = await getDb();
  const id = formData.get('id');
  const campaign = await getActiveCampaign();
  if (!campaign) return { error: 'No active campaign' };

  const daily_post_target = parseInt(formData.get('daily_post_target')) || 70;

  try {
    await db.prepare(`
      INSERT OR REPLACE INTO writer_assignments (campaign_id, user_id, daily_post_target)
      VALUES (?, ?, ?)
    `).run(campaign.id, id, daily_post_target);
    revalidatePath('/admin/users');
    return { success: 'Writer assigned to campaign' };
  } catch (err) {
    return { error: err.message };
  }
}

export async function unassignUser(id) {
  const db = await getDb();
  const campaign = await getActiveCampaign();
  if (!campaign) return { error: 'No active campaign' };

  try {
    await db.prepare('DELETE FROM associate_assignments WHERE campaign_id = ? AND user_id = ?').run(campaign.id, id);
    await db.prepare('DELETE FROM writer_assignments WHERE campaign_id = ? AND user_id = ?').run(campaign.id, id);
    revalidatePath('/admin/users');
    return { success: 'User unassigned' };
  } catch (err) {
    return { error: err.message };
  }
}

export async function importAssociatesFromSheet(prevState, formData) {
  const db = await getDb();
  const associatesJson = formData.get('associates_json');

  try {
    const associates = JSON.parse(associatesJson);

    if (!Array.isArray(associates)) {
      return { error: 'Invalid data format' };
    }

    const campaign = await getActiveCampaign();
    if (!campaign) {
      return { error: 'No active campaign. Please create or select a campaign first.' };
    }

    let createdCount = 0;
    let skippedCount = 0;
    let assignedClientsCount = 0;

    // Get campaign start date
    const campaignStartDate = new Date(campaign.start_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const associate of associates) {
      try {
        // Check if associate already exists (by name)
        let existing = await db.prepare("SELECT id FROM users WHERE name = ? AND role = 'seo_associate'").get(associate.name);
        let associateId;

        if (existing) {
          associateId = existing.id;
          skippedCount++;
          // IMPORTANT: Delete all existing tasks for this associate so we can reassign fresh
          await db.prepare("DELETE FROM seo_tasks WHERE associate_id = ? AND campaign_id = ?").run(associateId, campaign.id);
        } else {
          // Create a temporary password (user can change it later)
          const tempPassword = Math.random().toString(36).slice(-8);
          const hash = bcrypt.hashSync(tempPassword, 10);

          // Create the associate user
          await db.prepare(`
            INSERT INTO users (name, email, password, role, is_active)
            VALUES (?, ?, ?, 'seo_associate', 1)
          `).run(
            associate.name,
            `${associate.name.toLowerCase().replace(/\s+/g, '.')}@bizscale-associates.local`,
            hash
          );

          // Get the newly created user id
          const newUser = await db.prepare("SELECT id FROM users WHERE name = ? AND role = 'seo_associate'").get(associate.name);
          associateId = newUser.id;
          createdCount++;
        }

        // Now assign the clients to this associate with proper distribution
        if (associate.clients && associate.clients.length > 0) {
          // First, find all matching clients
          const matchedClients = [];
          for (const clientName of associate.clients) {
            try {
              const client = await db.prepare(
                "SELECT id FROM clients WHERE campaign_id = ? AND name = ?"
              ).get(campaign.id, clientName);

              if (client) {
                matchedClients.push(client);
              } else {
                console.warn(`Client "${clientName}" not found in campaign. Skipping.`);
              }
            } catch (err) {
              console.warn(`Failed to find client ${clientName}:`, err.message);
            }
          }

          // Monthly targets (total 50 links per client across entire campaign)
          const monthlyTargets = {
            web2: campaign.web2_target || 7,
            guestpost: campaign.guestpost_target || 7,
            pdf: campaign.pdf_target || 7,
            profile: campaign.profile_target || 10,
            citation: campaign.citation_target || 10,
            image: campaign.image_target || 9,
          };

          // Count only work days (Mon-Fri) in campaign
          let workDayCount = 0;
          for (let d = 0; d < campaign.total_days; d++) {
            const testDate = new Date(campaignStartDate);
            testDate.setDate(testDate.getDate() + d);
            const dow = testDate.getDay();
            if (dow !== 0 && dow !== 6) { // Not Sunday or Saturday
              workDayCount++;
            }
          }

          // Daily targets = Monthly targets / Work days
          const dailyTargets = {
            web2: Math.ceil(monthlyTargets.web2 / workDayCount),
            guestpost: Math.ceil(monthlyTargets.guestpost / workDayCount),
            pdf: Math.ceil(monthlyTargets.pdf / workDayCount),
            profile: Math.ceil(monthlyTargets.profile / workDayCount),
            citation: Math.ceil(monthlyTargets.citation / workDayCount),
            image: Math.ceil(monthlyTargets.image / workDayCount),
          };

          const linkTypes = [
            { type: 'web2', target: dailyTargets.web2 },
            { type: 'guestpost', target: dailyTargets.guestpost },
            { type: 'pdf', target: dailyTargets.pdf },
            { type: 'profile', target: dailyTargets.profile },
            { type: 'citation', target: dailyTargets.citation },
            { type: 'image', target: dailyTargets.image },
          ];

          const clientsPerWorkDay = 4;

          // Assign same 4 clients every work day for entire campaign
          for (let dayNum = 1; dayNum <= campaign.total_days; dayNum++) {
            // Calculate task date
            const taskDate = new Date(campaignStartDate);
            taskDate.setDate(taskDate.getDate() + (dayNum - 1));
            const taskDateStr = taskDate.toISOString().split('T')[0];
            
            // Get day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
            const dayOfWeekNum = taskDate.getDay();
            
            // Skip Saturdays (6) and Sundays (0)
            if (dayOfWeekNum === 0 || dayOfWeekNum === 6) {
              continue;
            }

            // Determine which clients to assign on this day (repeating pattern)
            // Monday: clients 0-3
            // Tuesday: clients 4-7
            // Wednesday: clients 8-11
            // Thursday: clients 12-15
            // Friday: clients 16+
            const workDayOfWeek = dayOfWeekNum; // Mon=1, Tue=2, Wed=3, Thu=4, Fri=5

            let clientIndexStart;
            let clientIndexEnd;
            
            if (workDayOfWeek <= 4) {
              // Monday-Thursday: 4 clients per day
              clientIndexStart = (workDayOfWeek - 1) * clientsPerWorkDay;
              clientIndexEnd = clientIndexStart + clientsPerWorkDay;
            } else {
              // Friday: remaining clients
              clientIndexStart = 4 * clientsPerWorkDay;
              clientIndexEnd = matchedClients.length;
            }

            // Get the clients for this day
            const clientsForThisDay = matchedClients.slice(clientIndexStart, clientIndexEnd);

            // Create tasks for SAME 4 clients every day
            for (const client of clientsForThisDay) {
              for (const { type, target } of linkTypes) {
                await db.prepare(`
                  INSERT OR IGNORE INTO seo_tasks 
                  (campaign_id, associate_id, client_id, day_number, task_date, link_type, target_count, completed_count)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                `).run(campaign.id, associateId, client.id, dayNum, taskDateStr, type, target);
              }
              assignedClientsCount++;
            }
          }
        }
      } catch (err) {
        console.error(`Failed to process associate ${associate.name}:`, err.message);
        skippedCount++;
      }
    }

    revalidatePath('/admin/users');
    revalidatePath('/admin');

    return {
      success: `Imported ${createdCount} associates (${skippedCount} skipped/updated). Created tasks for ${assignedClientsCount} clients across all campaign days.`,
    };
  } catch (err) {
    console.error('Import error:', err);
    return { error: err.message };
  }
}
