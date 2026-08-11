import moment from 'moment';
import { getDb } from './db';
import { LINK_TYPES } from './services';
import { getOffDaysSet, getWorkingDays } from './offDays';
import { FUNNEL_BONUS_FIELDS } from './funnelConstants';

// Rotation formula: 16 total days ÷ 5 rotation groups = 3.2 times per month per
// client — converts a set of MONTHLY per-link-type targets into DAILY targets,
// flooring each one and then handing any remainder (from the floor rounding) to
// the highest-value link types first. Shared by both the normal campaign targets
// and a funnel Month 2/3 client's own (smaller, bonus-field-sourced) targets, so
// both follow the identical distribution shape.
function computeDailyLinkTargets(monthlyTargets) {
  const dailyLinkTargets = {};
  let totalDailyTarget = 0;

  for (const [linkType, monthlyTarget] of Object.entries(monthlyTargets)) {
    const dailyValue = monthlyTarget / 3.2;
    dailyLinkTargets[linkType] = Math.floor(dailyValue);
    totalDailyTarget += dailyLinkTargets[linkType];
  }

  const totalMonthlyTarget = Object.values(monthlyTargets).reduce((a, b) => a + b, 0);
  const rotationDivisor = 3.2;
  const expectedDailyPerClient = Math.floor(totalMonthlyTarget / rotationDivisor);

  if (totalDailyTarget < expectedDailyPerClient) {
    const remaining = expectedDailyPerClient - totalDailyTarget;
    const priorityOrder = ['profile', 'citation', 'image', 'pdf', 'guestpost', 'web2'];
    for (let i = 0; i < remaining && i < priorityOrder.length; i++) {
      dailyLinkTargets[priorityOrder[i]]++;
    }
  }

  return dailyLinkTargets;
}

// A funnel client in Month 2 or 3 is tracked through this same seo_tasks pipeline
// (day-distributed, Google Sheet-synced) rather than the separate Month 1
// tunnel_tasks checklist — but their target for each link type is ONLY the
// Month 2 & 3 Bonus Link Targets configured on the campaign (Admin → Funnel),
// not the normal campaign target plus the bonus.
function isFunnelBonusMonthClient(client) {
  return client.tunnel_status === 'active' && (client.funnel_month === 2 || client.funnel_month === 3);
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

  // Funnel Month 1 clients (fixed platform checklist, tracked separately in
  // tunnel_tasks) are excluded, but Month 2/3 clients ARE included here — they get
  // real day-distributed, sheet-synced tasks like any other client, just at their
  // own (smaller, bonus-field-sourced) target instead of the campaign's normal one.
  const clients = await db.prepare(`
    SELECT * FROM clients WHERE campaign_id = ? AND is_active = 1
      AND (tunnel_status IS NULL OR tunnel_status != 'active' OR funnel_month IN (2, 3))
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

  // Regeneration wipes and rebuilds every task row (needed since adding/removing a
  // client shifts the rotation), which would otherwise reset completed_count to 0 for
  // every already-passed day — the completed-links sync only ever writes to *today's*
  // row, so a wiped past day can never be refilled. Snapshot existing progress first,
  // keyed by (client, day, link type) — that combination stays stable across
  // regenerations since new clients are appended rather than inserted into existing
  // rotation slots — so it can be re-applied to the freshly generated rows below.
  const priorCompleted = new Map();
  const priorRows = await db.prepare(`
    SELECT client_id, day_number, link_type, completed_count
    FROM seo_tasks
    WHERE campaign_id = ? AND completed_count > 0
  `).all(campaignId);
  for (const row of priorRows) {
    priorCompleted.set(`${row.client_id}|${row.day_number}|${row.link_type}`, row.completed_count);
  }

  // Clear existing tasks for this campaign
  await db.prepare('DELETE FROM seo_tasks WHERE campaign_id = ?').run(campaignId);

  const allTasks = [];

  // Daily targets for normal clients, from the campaign's monthly link-type targets.
  const dailyLinkTargets = computeDailyLinkTargets(monthlyLinkTargets);

  // Monthly targets for funnel Month 2/3 clients, from the campaign's Month 2 & 3
  // Bonus Link Targets (Admin → Funnel) instead — this is their WHOLE target for
  // that month, not the normal target plus the bonus. Split exactly across their
  // occurrences below (not approximated via computeDailyLinkTargets).
  const funnelMonthlyLinkTargets = {};
  for (const linkType of LINK_TYPES) {
    funnelMonthlyLinkTargets[linkType] = campaign[FUNNEL_BONUS_FIELDS[linkType]] || 0;
  }

  // Get all clients with their assigned associates
  const clientsWithAssignments = await db.prepare(`
    SELECT c.*, u.id as associate_id
    FROM clients c
    LEFT JOIN users u ON u.id = c.assigned_associate_id
    WHERE c.campaign_id = ? AND c.is_active = 1
      AND (c.tunnel_status IS NULL OR c.tunnel_status != 'active' OR c.funnel_month IN (2, 3))
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

    // First pass: work out exactly which days each client appears on (their
    // rotation slot recurs every 5 working days — see below), before generating
    // any rows. Needed so a funnel bonus-month client's EXACT monthly target can
    // be split across their real occurrence count, rather than approximated by
    // a shared daily rate.
    const clientOccurrenceDays = new Map();
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

      for (const client of dayClientsToProcess) {
        if (!clientOccurrenceDays.has(client.id)) clientOccurrenceDays.set(client.id, []);
        clientOccurrenceDays.get(client.id).push({ dayNumber: currentWorkday, dateStr: taskDateStr });
      }
    }

    // Second pass: generate each client's rows across their own occurrence days.
    for (const client of assignedClients) {
      const occurrences = clientOccurrenceDays.get(client.id);
      if (!occurrences || occurrences.length === 0) continue;

      if (isFunnelBonusMonthClient(client)) {
        // Exact distribution: split each link type's WHOLE monthly bonus target
        // across this client's occurrences, front-loaded remainder (same
        // convention used elsewhere in the app for exact monthly splits), so the
        // full defined number is always delivered by month's end instead of an
        // approximated daily rate.
        for (const linkType of LINK_TYPES) {
          const monthlyTarget = funnelMonthlyLinkTargets[linkType];
          if (monthlyTarget <= 0) continue;

          const base = Math.floor(monthlyTarget / occurrences.length);
          const remainder = monthlyTarget % occurrences.length;

          occurrences.forEach(({ dayNumber, dateStr }, i) => {
            const chunkSize = base + (i < remainder ? 1 : 0);
            if (chunkSize <= 0) return;

            const priorKey = `${client.id}|${dayNumber}|${linkType}`;
            allTasks.push({
              campaign_id: campaignId,
              associate_id: associate.user_id,
              client_id: client.id,
              day_number: dayNumber,
              task_date: dateStr,
              link_type: linkType,
              target_count: chunkSize,
              completed_count: priorCompleted.get(priorKey) || 0
            });
          });
        }
      } else {
        // Normal clients: existing shared daily-rate approach, applied on each
        // of their occurrence days.
        for (const { dayNumber, dateStr } of occurrences) {
          for (const [linkType, dailyTarget] of Object.entries(dailyLinkTargets)) {
            if (dailyTarget > 0) {
              const priorKey = `${client.id}|${dayNumber}|${linkType}`;
              allTasks.push({
                campaign_id: campaignId,
                associate_id: associate.user_id,
                client_id: client.id,
                day_number: dayNumber,
                task_date: dateStr,
                link_type: linkType,
                target_count: dailyTarget,
                completed_count: priorCompleted.get(priorKey) || 0
              });
            }
          }
        }
      }
    }
  }

  // Insert all tasks atomically
  if (allTasks.length > 0) {
    const insertSql = `
      INSERT INTO seo_tasks (campaign_id, associate_id, client_id, day_number, task_date, link_type, target_count, completed_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await db.batch(allTasks.map(t => ({
      sql: insertSql,
      args: [t.campaign_id, t.associate_id, t.client_id, t.day_number, t.task_date, t.link_type, t.target_count, t.completed_count],
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
