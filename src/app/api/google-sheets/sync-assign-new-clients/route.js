import { getDb, initDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import { generateSEOTasks } from '@/lib/taskService';
import { enrollClientInFunnel } from '@/lib/funnel';

// 60s is the max allowed on Vercel's Hobby plan — see src/app/api/cron/daily-sync/route.js
// for why this matters (a killed function fails silently with no error surfaced). This
// route is called internally as part of that chain.
export const maxDuration = 60;

export async function POST(request) {
  try {
    await initDb(); // Ensure tables are created
    const db = await getDb();

    const { newClients, associateAssignments, writerAssignments, campaignId } = await request.json();

    let campaign = null;
    if (campaignId) {
      campaign = await db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
    } else {
      campaign = await getActiveCampaign();
    }

    if (!campaign) {
      return Response.json(
        { error: 'No active campaign' },
        { status: 400 }
      );
    }

    // Funnel month advancement/graduation is manual only now (admin's "force advance"
    // action on /admin/funnel) — no automatic date-based sweep runs here anymore.

    if (!newClients || !Array.isArray(newClients)) {
      return Response.json(
        { error: 'No new clients provided' },
        { status: 400 }
      );
    }

    let results = {
      clientsAdded: 0,
      tasksCreated: 0,
      notAssigned: [],
    };

    // Get current max sort_order
    let maxSortOrder = (await db.prepare(`
      SELECT MAX(sort_order) as max_so FROM clients WHERE campaign_id = ?
    `).get(campaign.id)).max_so || 0;

    // Map to track which clients are assigned to which associate/writer
    const clientAssignmentMap = {}; // { "Client Name": associateId }
    const clientWriterMap = {}; // { "Client Name": writerId }

    // Pre-process: Create/fetch all associates and build mapping
    const associateMap = {}; // { "Associate Name": userId }
    
    if (associateAssignments) {
      for (const [associateName, clientNames] of Object.entries(associateAssignments)) {
        // Get or create associate
        let assocUser = await db.prepare(
          "SELECT id FROM users WHERE name = ? AND role = 'seo_associate'"
        ).get(associateName);

        if (!assocUser) {
          try {
            const tempPassword = Math.random().toString(36).substring(2, 10);
            await db.prepare(`
              INSERT INTO users (name, email, password, role, is_active)
              VALUES (?, ?, ?, 'seo_associate', 1)
            `).run(
              associateName,
              `${associateName.toLowerCase().replace(/\s+/g, '.')}@bizscale-seo.local`,
              tempPassword
            );

            assocUser = await db.prepare(
              "SELECT id FROM users WHERE name = ? AND role = 'seo_associate'"
            ).get(associateName);

            console.log(`Created new SEO Associate: ${associateName}`);
          } catch (err) {
            console.error(`Failed to create associate ${associateName}:`, err.message);
            continue;
          }
        }

        if (assocUser) {
          associateMap[associateName] = assocUser.id;
          
          // Map each client to this associate
          for (const clientName of clientNames) {
            clientAssignmentMap[clientName] = assocUser.id;
          }
        }
      }
    }

    // Pre-process: Create/fetch all writers and build mapping
    const writerMap = {}; // { "Writer Name": userId }
    
    if (writerAssignments) {
      for (const [writerName, clientNames] of Object.entries(writerAssignments)) {
        // Get or create writer
        let writerUser = await db.prepare(
          "SELECT id FROM users WHERE name = ? AND role = 'writer'"
        ).get(writerName);

        if (!writerUser) {
          try {
            const bcrypt = require('bcryptjs');
            const tempPassword = bcrypt.hashSync(Math.random().toString(36).substring(7), 10);
            await db.prepare(`
              INSERT INTO users (name, email, password, role, is_active)
              VALUES (?, ?, ?, 'writer', 1)
            `).run(
              writerName,
              `${writerName.toLowerCase().replace(/\s+/g, '.')}@bizscale-writers.local`,
              tempPassword
            );

            writerUser = await db.prepare(
              "SELECT id FROM users WHERE name = ? AND role = 'writer'"
            ).get(writerName);

            console.log(`Created new Writer: ${writerName}`);
          } catch (err) {
            console.error(`Failed to create writer ${writerName}:`, err.message);
            continue;
          }
        }

        if (writerUser) {
          writerMap[writerName] = writerUser.id;
          
          // Map each client to this writer
          for (const clientName of clientNames) {
            clientWriterMap[clientName] = writerUser.id;
          }
        }
      }
    }

    // First pass: Add all new clients to database with their assigned associate and writer
    for (const clientData of newClients) {
      try {
        // Check if client already exists
        const existing = await db.prepare(
          'SELECT id FROM clients WHERE campaign_id = ? AND name = ?'
        ).get(campaign.id, clientData.name);

        if (existing) {
          console.log(`Client "${clientData.name}" already exists`);
          continue;
        }

        // Increment sort_order for new client
        maxSortOrder++;

        // Get the assigned associate and writer for this client
        const assignedAssociateId = clientAssignmentMap[clientData.name] || null;
        const assignedWriterId = clientWriterMap[clientData.name] || null;

        // Add client to database with sort_order, assigned associate, and writer
        const insertResult = await db.prepare(`
          INSERT INTO clients (campaign_id, name, website, is_active, sort_order, assigned_associate_id, assigned_writer_id)
          VALUES (?, ?, ?, 1, ?, ?, ?)
        `).run(campaign.id, clientData.name, clientData.website || '', maxSortOrder, assignedAssociateId, assignedWriterId);

        // Newly-discovered clients go through the Funnel onboarding checklist instead
        // of straight into the regular task rotation.
        await enrollClientInFunnel(insertResult.lastInsertRowid, campaign.id);

        results.clientsAdded++;

        if (!assignedAssociateId) {
          results.notAssigned.push(clientData.name);
        }

        console.log(`Added new client "${clientData.name}" assigned to associate ID ${assignedAssociateId} and writer ID ${assignedWriterId}, enrolled in Funnel`);
      } catch (err) {
        console.error(`Failed to add client ${clientData.name}:`, err.message);
      }
    }

    // Second pass: Update associate assignments with all active clients
    const allClients = await db.prepare(`
      SELECT id, sort_order FROM clients WHERE campaign_id = ? AND is_active = 1 ORDER BY sort_order, id
    `).all(campaign.id);

    for (const [associateName, associateId] of Object.entries(associateMap)) {
      try {
        if (allClients.length === 0) continue;

        // Get min and max sort_order from all active clients
        const minSortOrder = Math.min(...allClients.map(c => c.sort_order || 0));
        const maxSortOrder = Math.max(...allClients.map(c => c.sort_order || 0));

        // Update or create associate assignment
        const existingAssignment = await db.prepare(`
          SELECT id FROM associate_assignments WHERE campaign_id = ? AND user_id = ?
        `).get(campaign.id, associateId);

        if (existingAssignment) {
          await db.prepare(`
            UPDATE associate_assignments 
            SET client_group_start = ?, client_group_end = ?
            WHERE campaign_id = ? AND user_id = ?
          `).run(minSortOrder, maxSortOrder, campaign.id, associateId);
        } else {
          await db.prepare(`
            INSERT INTO associate_assignments (campaign_id, user_id, client_group_start, client_group_end)
            VALUES (?, ?, ?, ?)
          `).run(campaign.id, associateId, minSortOrder, maxSortOrder);
        }

        console.log(`Updated associate assignment for ${associateName}`);
      } catch (err) {
        console.error(`Failed to update associate ${associateName}:`, err.message);
      }
    }

    // Third pass: Create writer assignments
    for (const [writerName, writerId] of Object.entries(writerMap)) {
      try {
        const existingAssignment = await db.prepare(`
          SELECT id FROM writer_assignments WHERE campaign_id = ? AND user_id = ?
        `).get(campaign.id, writerId);

        if (!existingAssignment) {
          await db.prepare(`
            INSERT INTO writer_assignments (campaign_id, user_id, daily_post_target)
            VALUES (?, ?, 52)
          `).run(campaign.id, writerId);

          console.log(`Created writer assignment for ${writerName}`);
        }
      } catch (err) {
        console.error(`Failed to create writer assignment for ${writerName}:`, err.message);
      }
    }

    // Fourth pass: regenerate all SEO tasks for the campaign
    try {
      results.tasksCreated = await generateSEOTasks(campaign.id);
      console.log(`Generated ${results.tasksCreated} SEO tasks for campaign`);
    } catch (err) {
      console.error('Failed to generate SEO tasks:', err.message);
      return Response.json(
        { error: 'task_generation_error', message: err.message },
        { status: 500 }
      );
    }

    // Writer task generation is no longer driven by this sync — writers now get
    // their tasks from the GBP-Off Page / Web-Off Page sheets directly (see
    // src/lib/writerOffpageSync.js, on its own cron trigger).

    return Response.json({
      success: true,
      results,
      message: `Added ${results.clientsAdded} clients, created ${results.tasksCreated} tasks with proper assignment`,
    });
  } catch (error) {
    console.error('Assign new clients error:', error);
    return Response.json(
      { error: 'assign_error', message: error.message },
      { status: 500 }
    );
  }
}
