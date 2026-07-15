import moment from 'moment';
import { getDb } from './db';
import { LINK_TYPES } from './services';
import { getOffDaysSet, getWorkingDays } from './offDays';

// Writer task type distribution per week
function getWriterWeekDistribution(approach, weekNumber) {
  if (approach === 1) {
    const patterns = [
      { guestpost: 2, web2: 3, pdf: 2 },
      { guestpost: 3, web2: 2, pdf: 2 },
      { guestpost: 2, web2: 2, pdf: 3 }
    ];
    return patterns[(weekNumber - 1) % patterns.length];
  } else {
    const patterns = [
      { guestpost: 7, web2: 0, pdf: 0 },
      { guestpost: 0, web2: 7, pdf: 0 },
      { guestpost: 0, web2: 0, pdf: 7 }
    ];
    return patterns[(weekNumber - 1) % patterns.length];
  }
}

export async function generateSEOTasks(campaignId) {
  const db = await getDb();
  const campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const associates = await db.prepare(`
    SELECT aa.*, u.name, u.email, u.id as user_id
    FROM associate_assignments aa
    JOIN users u ON u.id = aa.user_id
    WHERE aa.campaign_id = ?
    ORDER BY aa.id
  `).all(campaignId);

  if (associates.length === 0) throw new Error('No SEO associates assigned to this campaign');

  const clients = await db.prepare(`
    SELECT * FROM clients WHERE campaign_id = ? AND is_active = 1
      AND (tunnel_status IS NULL OR tunnel_status != 'active')
    ORDER BY sort_order, id
  `).all(campaignId);

  if (clients.length === 0) throw new Error('No clients found for this campaign');

  const totalDays = campaign.total_days || 16;
  const clientsPerDay = campaign.clients_per_day || 4;
  const offDays = await getOffDaysSet(campaignId);
  // total_days means working days — the calendar range extends past weekends/off-days
  // as needed to fit all of them, e.g. a 16-working-day campaign typically spans ~22
  // calendar days.
  const workingDays = getWorkingDays(campaign.start_date || moment().format('YYYY-MM-DD'), totalDays, offDays);

  // Link targets from campaign (MONTHLY targets per link type per client)
  const monthlyLinkTargets = {
    web2: campaign.web2_target || 7,
    guestpost: campaign.guestpost_target || 7,
    pdf: campaign.pdf_target || 7,
    profile: campaign.profile_target || 10,
    citation: campaign.citation_target || 10,
    image: campaign.image_target || 9,
  };

  // Clear existing tasks for this campaign
  await db.prepare('DELETE FROM seo_tasks WHERE campaign_id = ?').run(campaignId);

  const allTasks = [];

  // Calculate total monthly target (50 per client per month)
  const totalMonthlyTarget = Object.values(monthlyLinkTargets).reduce((a, b) => a + b, 0);
  
  // Calculate daily targets per link type:
  // Based on campaign settings:
  // - Monthly targets are READ FROM CAMPAIGN DB (web2_target, guestpost_target, etc.)
  // - Not hardcoded, they're fully dynamic based on campaign configuration
  // 
  // Rotation formula: 16 total days ÷ 5 rotation groups = 3.2 times per month per client
  // Daily target per client when working = 50 / 3.2 ≈ 15.625 links
  //
  // For each link type on a working day:
  // daily = (monthly_target from DB / 50) × 15.625
  // = (monthly_target from DB / 50) × (50 / 3.2)
  // = monthly_target from DB / 3.2
  
  const dailyLinkTargets = {};
  let totalDailyTarget = 0;
  
  // Calculate daily value for each link type based on its monthly target from campaign DB
  for (const [linkType, monthlyTarget] of Object.entries(monthlyLinkTargets)) {
    // Divide by 3.2 to get daily target (fully calculated, not hardcoded values)
    const dailyValue = monthlyTarget / 3.2;
    // Use Math.floor to avoid over-counting
    dailyLinkTargets[linkType] = Math.floor(dailyValue);
    totalDailyTarget += dailyLinkTargets[linkType];
  }
  
  // Distribute any remaining links due to floor() rounding
  // Each client should work ~15.625 links per day, so total should be 15 (with ~0.625 rounding)
  const rotationDivisor = 3.2; // 16 days / 5 groups
  const linksPerClientPerMonth = totalMonthlyTarget; // 50 per client
  const expectedDailyPerClient = Math.floor(linksPerClientPerMonth / rotationDivisor); // 15
  
  if (totalDailyTarget < expectedDailyPerClient) {
    const remaining = expectedDailyPerClient - totalDailyTarget;
    // Add remaining to the highest-value targets (profile, citation, image)
    const priorityOrder = ['profile', 'citation', 'image', 'pdf', 'guestpost', 'web2'];
    for (let i = 0; i < remaining && i < priorityOrder.length; i++) {
      dailyLinkTargets[priorityOrder[i]]++;
    }
  }

  // Get all clients with their assigned associates
  const clientsWithAssignments = await db.prepare(`
    SELECT c.*, u.id as associate_id
    FROM clients c
    LEFT JOIN users u ON u.id = c.assigned_associate_id
    WHERE c.campaign_id = ? AND c.is_active = 1
      AND (c.tunnel_status IS NULL OR c.tunnel_status != 'active')
    ORDER BY c.sort_order
  `).all(campaignId);

  // Group clients by associate
  const clientsByAssociate = {};
  for (const client of clientsWithAssignments) {
    if (!client.associate_id) continue; // Skip unassigned clients
    
    if (!clientsByAssociate[client.associate_id]) {
      clientsByAssociate[client.associate_id] = [];
    }
    clientsByAssociate[client.associate_id].push(client);
  }

  // For each associate, create tasks with client rotation
  for (const associate of associates) {
    const assignedClients = clientsByAssociate[associate.user_id] || [];

    if (assignedClients.length === 0) continue;

    // For each working day in the campaign
    for (const { dayNumber: currentWorkday, dateStr: taskDateStr } of workingDays) {
      // Determine which 4 clients work on this day using rotation
      // Days 1,6,11: clients 0-3
      // Days 2,7,12: clients 4-7
      // Days 3,8,13: clients 8-11
      // Days 4,9,14: clients 12-15
      // Days 5,10,15: clients 16-19
      // Day 16: remaining clients
      
      const dayInWeek = ((currentWorkday - 1) % 5); // 0-4 for which rotation
      const startClientIdx = dayInWeek * 4;
      const endClientIdx = Math.min(startClientIdx + 4, assignedClients.length);
      
      const dayClientsToProcess = assignedClients.slice(startClientIdx, endClientIdx);

      // Create tasks for these clients on this day using consistent daily distribution
      for (const client of dayClientsToProcess) {
        // Each link type gets its daily target for this client on this day
        for (const [linkType, dailyTarget] of Object.entries(dailyLinkTargets)) {
          if (dailyTarget > 0) {
            allTasks.push({
              campaign_id: campaignId,
              associate_id: associate.user_id,
              client_id: client.id,
              day_number: currentWorkday,
              task_date: taskDateStr,
              link_type: linkType,
              target_count: dailyTarget
            });
          }
        }
      }
    }
  }

  // Insert all tasks atomically
  if (allTasks.length > 0) {
    const insertSql = `
      INSERT INTO seo_tasks (campaign_id, associate_id, client_id, day_number, task_date, link_type, target_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    await db.batch(allTasks.map(t => ({
      sql: insertSql,
      args: [t.campaign_id, t.associate_id, t.client_id, t.day_number, t.task_date, t.link_type, t.target_count],
    })));
  }

  return allTasks.length;
}

export async function generateWritingTasks(campaignId) {
  const db = await getDb();
  const campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const writers = await db.prepare(`
    SELECT wa.*, u.name
    FROM writer_assignments wa
    JOIN users u ON u.id = wa.user_id
    WHERE wa.campaign_id = ?
  `).all(campaignId);

  if (writers.length === 0) throw new Error('No writers assigned to this campaign');

  // Get active clients count to calculate daily target per client
  const activeClientCount = (await db.prepare(`
    SELECT COUNT(*) as count FROM clients WHERE campaign_id = ? AND is_active = 1
  `).get(campaignId)).count;

  if (activeClientCount === 0) throw new Error('No active clients found for this campaign');

  const totalDays = campaign.total_days;
  const daysPerWeek = 5;
  const offDays = await getOffDaysSet(campaignId);
  const workingDays = getWorkingDays(campaign.start_date || moment().format('YYYY-MM-DD'), totalDays, offDays);
  const monthlyPostsPerClient = campaign.writers_daily_target || 21; // This now stores monthly posts per client

  // Calculate daily posts needed per writer to meet monthly targets
  // Total monthly posts needed = monthlyPostsPerClient * activeClientCount
  // Daily posts per writer = (monthlyPostsPerClient * activeClientCount) / totalDays / numberOfWriters
  const totalMonthlyPostsNeeded = monthlyPostsPerClient * activeClientCount;
  const dailyPostsPerWriterToMeetTarget = Math.ceil(totalMonthlyPostsNeeded / totalDays);

  // Clear existing writing tasks
  await db.prepare('DELETE FROM writing_tasks WHERE campaign_id = ?').run(campaignId);

  const allTasks = [];

  for (const writer of writers) {
    // Each writer gets an equal share of the daily posts needed
    const dailyTarget = Math.ceil(dailyPostsPerWriterToMeetTarget / writers.length);

    for (const { dayNumber: currentWorkday, dateStr: taskDate } of workingDays) {
      const weekNumber = Math.floor((currentWorkday - 1) / daysPerWeek) + 1;
      const dist = getWriterWeekDistribution(campaign.writer_approach || 1, weekNumber);
      const totalWeekPosts = Object.values(dist).reduce((a, b) => a + b, 0);

      if (totalWeekPosts === 0) continue;

      Object.entries(dist).forEach(([postType, weekCount]) => {
        if (weekCount === 0) return;
        const dailyCount = Math.round(dailyTarget * (weekCount / totalWeekPosts));
        if (dailyCount > 0) {
          allTasks.push({
            campaign_id: campaignId,
            writer_id: writer.user_id,
            week_number: weekNumber,
            day_number: currentWorkday,
            task_date: taskDate,
            post_type: postType,
            target_count: dailyCount
          });
        }
      });
    }
  }

  if (allTasks.length > 0) {
    const insertSql = `
      INSERT INTO writing_tasks (campaign_id, writer_id, week_number, day_number, task_date, post_type, target_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    await db.batch(allTasks.map(t => ({
      sql: insertSql,
      args: [t.campaign_id, t.writer_id, t.week_number, t.day_number, t.task_date, t.post_type, t.target_count],
    })));
  }

  return allTasks.length;
}

// Get today's SEO tasks for an associate
export async function getAssociateTodayTasks(associateId, campaignId, date) {
  const db = await getDb();
  const taskDate = date || moment().format('YYYY-MM-DD');

  return db.prepare(`
    SELECT st.*, c.name as client_name, c.website as client_website,
           u.name as associate_name
    FROM seo_tasks st
    JOIN clients c ON c.id = st.client_id
    JOIN users u ON u.id = st.associate_id
    WHERE st.associate_id = ? AND st.campaign_id = ? AND st.task_date = ?
    ORDER BY c.sort_order, st.link_type
  `).all(associateId, campaignId, taskDate);
}

// Get today's writing tasks for a writer
export async function getWriterTodayTasks(writerId, campaignId, date) {
  const db = await getDb();
  const taskDate = date || moment().format('YYYY-MM-DD');

  return db.prepare(`
    SELECT wt.*, u.name as writer_name
    FROM writing_tasks wt
    JOIN users u ON u.id = wt.writer_id
    WHERE wt.writer_id = ? AND wt.campaign_id = ? AND wt.task_date = ?
    ORDER BY wt.post_type
  `).all(writerId, campaignId, taskDate);
}
