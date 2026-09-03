import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';

// 60s is the max allowed on Vercel's Hobby plan — see src/app/api/cron/daily-sync/route.js
// for why this matters (a killed function fails silently with no error surfaced). This
// route is called internally as part of that chain.
export const maxDuration = 60;

export async function POST(request) {
  try {
    const db = await getDb();
    
    const body = await request.json();
    const { changes, campaignId, associateAssignments, writerAssignments } = body;

    console.log('[sync-apply] Request received:');
    console.log('  campaignId:', campaignId);
    console.log('  changes:', changes ? Object.keys(changes) : null);
    console.log('  associateAssignments:', associateAssignments ? Object.keys(associateAssignments).length : 0, 'associates');
    console.log('  writerAssignments:', writerAssignments ? Object.keys(writerAssignments).length : 0, 'writers');

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

    if (!changes) {
      return Response.json(
        { error: 'No changes provided' },
        { status: 400 }
      );
    }

    const today = new Date().toISOString().split('T')[0];
    let results = {
      deactivated: 0,
      reactivated: 0,
      associatesAssigned: 0,
      writersAssigned: 0,
      tasksDeleted: 0,
      writerTasksGenerated: false,
    };

    // Handle deactivated clients
    // Mark as inactive + delete UPCOMING tasks only (keep past/today)
    if (changes.deactivated && changes.deactivated.length > 0) {
      for (const client of changes.deactivated) {
        // Mark client as inactive
        await db.prepare('UPDATE clients SET is_active = 0 WHERE id = ?').run(client.id);

        // Delete tasks from TOMORROW onwards
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        const deletedTasks = await db.prepare(
          'DELETE FROM seo_tasks WHERE client_id = ? AND campaign_id = ? AND task_date > ?'
        ).run(client.id, campaign.id, today);

        results.deactivated++;
        console.log(`Deactivated client ${client.name}, deleted future tasks`);
      }
    }

    // Handle reactivated clients
    // Mark as active (tasks remain as is)
    if (changes.reactivated && changes.reactivated.length > 0) {
      for (const client of changes.reactivated) {
        await db.prepare('UPDATE clients SET is_active = 1 WHERE id = ?').run(client.db_id);
        results.reactivated++;
        console.log(`Reactivated client ${client.name}`);
      }
    }

    // Handle associate assignments from column H
    if (associateAssignments && Object.keys(associateAssignments).length > 0) {
      for (const [associateName, clientNames] of Object.entries(associateAssignments)) {
        // Find the associate user
        const associate = await db.prepare(
          "SELECT id FROM users WHERE role = 'seo_associate' AND name = ? AND is_active = 1"
        ).get(associateName);

        if (associate) {
          // Assign these clients to this associate
          for (const clientName of clientNames) {
            const client = await db.prepare(
              "SELECT id FROM clients WHERE campaign_id = ? AND name = ?"
            ).get(campaign.id, clientName);

            if (client) {
              await db.prepare(
                "UPDATE clients SET assigned_associate_id = ? WHERE id = ?"
              ).run(associate.id, client.id);
              results.associatesAssigned++;
            }
          }
        }
      }
      console.log(`Assigned ${results.associatesAssigned} clients to associates`);
    }

    // Column I's writer names still auto-create writer user accounts (so they exist
    // and can be picked from e.g. the Writer Campaign's writer list), but no longer
    // populate the retired writer_assignments/clients.assigned_writer_id pipeline —
    // writers now get their tasks and their own client roster entirely from the
    // GBP-Off Page / Web-Off Page sheets (see src/lib/writerOffpageSync.js, on its
    // own cron trigger), independent of this SEO sheet sync.
    if (writerAssignments && Object.keys(writerAssignments).length > 0) {
      for (const writerName of Object.keys(writerAssignments)) {
        // Matches regardless of is_active so a deactivated/removed writer isn't
        // silently re-created as a duplicate account the next time this name
        // appears in the sheet.
        const existing = await db.prepare(
          "SELECT id FROM users WHERE role = 'writer' AND name = ?"
        ).get(writerName);

        if (!existing) {
          try {
            const bcrypt = require('bcryptjs');
            const tempPassword = bcrypt.hashSync(Math.random().toString(36).substring(7), 10);
            const email = `${writerName.toLowerCase().replace(/\s+/g, '.')}@bizscale-writers.local`;

            await db.prepare(
              "INSERT INTO users (name, email, password, role, is_active) VALUES (?, ?, ?, 'writer', 1)"
            ).run(writerName, email, tempPassword);
            console.log(`[sync-apply] Created new writer: ${writerName}`);
          } catch (err) {
            console.error(`[sync-apply] Failed to create writer ${writerName}:`, err.message);
          }
        }
      }
    }

    return Response.json({
      success: true,
      results,
      message: `Applied changes: ${results.deactivated} deactivated, ${results.reactivated} reactivated, ${results.associatesAssigned} clients to associates`,
    });
  } catch (error) {
    console.error('Apply changes error:', error);
    return Response.json(
      { error: 'apply_error', message: error.message },
      { status: 500 }
    );
  }
}
