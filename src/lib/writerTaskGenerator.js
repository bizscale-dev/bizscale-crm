import { getDb } from './db';
import { getOffDaysSet, getWorkingDays } from './offDays';

/**
 * Generate writer tasks based on campaign parameters and client assignments
 * 
 * Uses clients that have assigned_writer_id set (from Google Sheets column I)
 * All calculations are based on campaign settings - no hardcoded values
 */
export async function generateWriterTasks(campaignId) {
  const db = await getDb();
  const campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  // Get all values from campaign - NOTHING hardcoded
  const totalDays = campaign.total_days || 16;
  const postsPerClient = campaign.posts_per_client || 21;
  const clientsPerDay = campaign.writer_clients_per_day || 8;
  const writersDailyTarget = campaign.writers_daily_target || 105;
  const offDays = await getOffDaysSet(campaignId);
  // total_days means working days — the calendar range extends past weekends/off-days
  // as needed to fit all of them.
  const workingDays = getWorkingDays(campaign.start_date, totalDays, offDays);

  console.log('[writerTaskGen] Campaign settings:', { campaignId, totalDays, postsPerClient, clientsPerDay, writersDailyTarget });

  // Get all writers assigned to this campaign
  const writers = await db.prepare(`
    SELECT DISTINCT u.id, u.name
    FROM users u
    JOIN writer_assignments wa ON wa.user_id = u.id
    WHERE wa.campaign_id = ? AND u.is_active = 1
    ORDER BY u.name
  `).all(campaignId);

  console.log(`[writerTaskGen] Found ${writers.length} writers for campaign ${campaignId}`);

  if (writers.length === 0) {
    throw new Error('No writers assigned to this campaign');
  }

  // Get total clients assigned to writers
  const totalClientsWithWriters = (await db.prepare(`
    SELECT COUNT(*) as count FROM clients WHERE campaign_id = ? AND assigned_writer_id IS NOT NULL AND is_active = 1
      AND (tunnel_status IS NULL OR tunnel_status != 'active')
  `).get(campaignId))?.count || 0;

  if (totalClientsWithWriters === 0) {
    throw new Error('No clients assigned to writers');
  }

  // Clear existing writing tasks for this campaign
  const deletedCount = (await db.prepare('DELETE FROM writing_tasks WHERE campaign_id = ?').run(campaignId)).changes;
  console.log(`[writerTaskGen] Cleared ${deletedCount} existing tasks`);

  let totalTasksCreated = 0;

  // FORMULA (all from campaign settings):
  // Total posts needed = total clients with writers × posts per client
  // Total task slots = total days × clients per day × number of writers
  // Posts per task = total posts needed ÷ total task slots
  
  const totalPostsNeeded = totalClientsWithWriters * postsPerClient;
  const totalTaskSlotsGlobal = totalDays * clientsPerDay * writers.length;
  const postsPerTask = Math.ceil(totalPostsNeeded / totalTaskSlotsGlobal);
  
  console.log(`[writerTaskGen] FORMULA:`);
  console.log(`  ${totalClientsWithWriters} clients × ${postsPerClient} posts/client = ${totalPostsNeeded} total posts needed`);
  console.log(`  ${totalDays} days × ${clientsPerDay} clients/day × ${writers.length} writers = ${totalTaskSlotsGlobal} total task slots`);
  console.log(`  ${totalPostsNeeded} posts ÷ ${totalTaskSlotsGlobal} slots = ${postsPerTask} posts/task`);
  console.log(`  Final: ${postsPerTask} posts/task × ${totalTaskSlotsGlobal} slots = ${postsPerTask * totalTaskSlotsGlobal} total posts`);

  // For each writer, get their assigned clients and create tasks
  const rows = [];

  for (const writer of writers) {
    console.log(`[writerTaskGen] Processing writer: ${writer.name} (ID: ${writer.id})`);

    // Get clients assigned to this writer
    const writerClients = await db.prepare(`
      SELECT id, name
      FROM clients
      WHERE campaign_id = ? AND assigned_writer_id = ? AND is_active = 1
        AND (tunnel_status IS NULL OR tunnel_status != 'active')
      ORDER BY sort_order
    `).all(campaignId, writer.id);

    console.log(`[writerTaskGen] Writer ${writer.name} has ${writerClients.length} assigned clients`);

    if (writerClients.length === 0) {
      console.warn(`[writerTaskGen] No clients assigned to writer ${writer.name}`);
      continue; // Skip this writer if no clients assigned
    }

    // Define post types to divide equally
    const postTypes = ['web2', 'guestpost', 'pdf'];
    const postsPerType = Math.floor(postsPerTask / postTypes.length);
    const remainderPosts = postsPerTask % postTypes.length;

    console.log(`[writerTaskGen] Dividing ${postsPerTask} posts equally among ${postTypes.length} types: ${postsPerType} each + ${remainderPosts} remainder`);

    // Create rotation schedule: 8 clients per day, rotating with round-robin distribution
    // This ensures ALL clients appear across the campaign period
    for (const { dayNumber: currentWorkday, dateStr: taskDateStr } of workingDays) {
      // Round-robin: spread clients evenly across working days
      // For each position in the 8-client slots, calculate which client index
      const todaysClients = [];
      for (let position = 0; position < clientsPerDay; position++) {
        // Calculate which client should be at this position on this working day
        // This ensures even distribution: client_index = (workday + position * days) % total_clients
        const clientIndex = (currentWorkday - 1 + position * totalDays) % writerClients.length;
        todaysClients.push(writerClients[clientIndex]);
      }

      if (todaysClients.length > 0) {
        console.log(`[writerTaskGen] Day ${currentWorkday} (${taskDateStr}): Creating ${todaysClients.length} × 3 type tasks for writer ${writer.name}`);
      }

      // Create a task for each client and each post type
      for (const client of todaysClients) {
        const weekNumber = Math.ceil(currentWorkday / 7);

        // Create 3 tasks per client - one for each post type
        postTypes.forEach((postType, typeIndex) => {
          const postsForThisType = postsPerType + (typeIndex < remainderPosts ? 1 : 0);

          rows.push({
            campaign_id: campaignId,
            writer_id: writer.id,
            client_id: client.id,
            week_number: weekNumber,
            day_number: currentWorkday,
            task_date: taskDateStr,
            post_type: postType,
            target_count: postsForThisType,
          });
          totalTasksCreated++;
        });
      }
    }
  }

  if (rows.length > 0) {
    const insertSql = `
      INSERT INTO writing_tasks (
        campaign_id, writer_id, client_id, week_number, day_number, task_date, post_type, target_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await db.batch(rows.map(r => ({
      sql: insertSql,
      args: [r.campaign_id, r.writer_id, r.client_id, r.week_number, r.day_number, r.task_date, r.post_type, r.target_count],
    })));
  }

  return {
    success: true,
    message: `Generated writing tasks for ${writers.length} writers`,
    taskCount: totalTasksCreated,
    details: {
      totalWriters: writers.length,
      postsPerWriterPerDay: Math.ceil(writersDailyTarget / writers.length),
      clientsPerDay: clientsPerDay,
      totalCampaignPosts: writersDailyTarget * totalDays
    }
  };
}

/**
 * Get all clients assigned to a specific writer
 */
export async function getWriterClients(writerId, campaignId) {
  const db = await getDb();

  return db.prepare(`
    SELECT DISTINCT c.id, c.name, c.website
    FROM clients c
    JOIN writing_tasks wt ON wt.client_id = c.id
    WHERE wt.writer_id = ? AND wt.campaign_id = ? AND c.is_active = 1
    ORDER BY c.sort_order
  `).all(writerId, campaignId);
}

/**
 * Get today's clients for a writer
 */
export async function getWriterTodayClients(writerId, campaignId, taskDate) {
  const db = await getDb();

  return db.prepare(`
    SELECT wt.id as task_id, c.id, c.name, c.website, wt.target_count, wt.completed_count
    FROM writing_tasks wt
    JOIN clients c ON c.id = wt.client_id
    WHERE wt.writer_id = ? AND wt.campaign_id = ? AND wt.task_date = ? AND c.is_active = 1
    ORDER BY c.sort_order
  `).all(writerId, campaignId, taskDate);
}
