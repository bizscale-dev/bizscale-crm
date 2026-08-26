import { getDb } from './db';
import { FUNNEL_MONTH1_ITEMS } from './funnelConstants';
import { computeFunnelMonth1Window, computeFunnelNextMonthWindow } from './campaign-cycle';
import { generateSEOTasks } from './taskService';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Seed the campaign's Month 1 reference template library (tunnel_templates,
 * week_number 1-4) from the hardcoded FUNNEL_MONTH1_ITEMS list, if it hasn't been
 * seeded yet. Also clears out any leftover flat (week_number = 0) rows from the old
 * pre-week-scheduled format, since those would otherwise sit orphaned alongside the
 * new ones.
 */
export async function seedMonth1TemplatesIfMissing(campaignId) {
  const db = await getDb();

  const existing = await db.prepare(
    'SELECT COUNT(*) as c FROM tunnel_templates WHERE campaign_id = ? AND week_number IN (1, 2, 3, 4)'
  ).get(campaignId);

  if (existing.c > 0) return 0;

  await db.prepare('DELETE FROM tunnel_templates WHERE campaign_id = ? AND week_number = 0').run(campaignId);

  const insertSql = `
    INSERT INTO tunnel_templates (campaign_id, week_number, category, platform, url, note, order_in_week)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const orderCounters = {};
  await db.batch(FUNNEL_MONTH1_ITEMS.map((item) => {
    const key = `${item.week_number}|${item.category}`;
    orderCounters[key] = (orderCounters[key] || 0) + 1;
    return {
      sql: insertSql,
      args: [campaignId, item.week_number, item.category, item.platform, item.url, item.note, orderCounters[key] - 1],
    };
  }));

  return FUNNEL_MONTH1_ITEMS.length;
}

/**
 * Enroll a client into the Funnel: sets month-1 window on the client row, seeds the
 * campaign's reference template library if missing, then regenerates seo_tasks so the
 * client immediately gets real Week 1 tasks — day-distributed and Google Sheet-synced,
 * same pipeline as every other client (see generateSEOTasks's Month 1 handling in
 * taskService.js). No more tunnel_tasks checklist instantiation.
 */
export async function enrollClientInFunnel(clientId, campaignId, enrollDate = todayStr()) {
  const db = await getDb();

  await seedMonth1TemplatesIfMissing(campaignId);

  const campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const { monthEndDate, cycleIndexAtEnroll } = computeFunnelMonth1Window(campaign.start_date, enrollDate);

  await db.prepare(`
    UPDATE clients
    SET tunnel_status = 'active', tunnel_start_date = ?, funnel_month = 1,
        funnel_month_end_date = ?, funnel_cycle_index_at_enroll = ?
    WHERE id = ?
  `).run(enrollDate, monthEndDate, cycleIndexAtEnroll, clientId);

  await generateSEOTasks(campaignId);

  const { count: tasksCreated } = await db.prepare(
    'SELECT COUNT(*) as count FROM seo_tasks WHERE campaign_id = ? AND client_id = ?'
  ).get(campaignId, clientId);

  return { monthEndDate, tasksCreated };
}

/**
 * Move a client into funnel month 2 or 3: updates their month window, then
 * regenerates the whole campaign's seo_tasks (generateSEOTasks already includes
 * Month 2/3 funnel clients — see src/lib/taskService.js — using their Month 2 & 3
 * Bonus Link Targets as their target instead of the campaign's normal one, day
 * distributed and Google Sheet-synced exactly like every other client). Existing
 * clients' completed_count is preserved across the regeneration by
 * generateSEOTasks itself.
 */
async function moveClientIntoBonusMonth(client, campaign, targetMonth, { skipRegeneration = false } = {}) {
  const db = await getDb();
  const { monthEndDate } = computeFunnelNextMonthWindow(campaign.start_date, client.funnel_month_end_date, targetMonth);

  await db.prepare('UPDATE clients SET funnel_month = ?, funnel_month_end_date = ? WHERE id = ?')
    .run(targetMonth, monthEndDate, client.id);

  if (skipRegeneration) return { newMonth: targetMonth, tasksCreated: null };

  await generateSEOTasks(client.campaign_id);

  const { count: tasksCreated } = await db.prepare(
    'SELECT COUNT(*) as count FROM seo_tasks WHERE campaign_id = ? AND client_id = ?'
  ).get(client.campaign_id, client.id);

  return { newMonth: targetMonth, tasksCreated };
}

/**
 * Advance a single funnel client by one stage: month 1 -> 2, 2 -> 3, or 3 -> graduate.
 * Used both by the batch progression sweep and by the admin's manual "force advance" action.
 */
export async function advanceOneFunnelClient(clientId, { skipRegeneration = false } = {}) {
  const db = await getDb();
  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
  if (!client || client.tunnel_status !== 'active') return { advanced: false };

  const campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get(client.campaign_id);
  if (!campaign) return { advanced: false };

  if (client.funnel_month === 1 || client.funnel_month === 2) {
    const nextMonth = client.funnel_month + 1;
    await moveClientIntoBonusMonth(client, campaign, nextMonth, { skipRegeneration });
    return { advanced: true, newMonth: nextMonth };
  }

  if (client.funnel_month === 3) {
    await db.prepare(`
      UPDATE clients SET tunnel_status = 'completed', funnel_month = NULL, funnel_month_end_date = NULL WHERE id = ?
    `).run(clientId);
    return { advanced: true, graduated: true };
  }

  return { advanced: false };
}

/**
 * Jump a funnel client directly to month 2 or 3, skipping any month in between —
 * the skipped month's tasks are simply never generated, only the target month's.
 * Used by the admin's manual "Move to Month 2/3" action, as an alternative to
 * advancing one month at a time.
 */
export async function jumpFunnelClientToMonth(clientId, targetMonth) {
  const db = await getDb();

  if (![2, 3].includes(targetMonth)) {
    return { moved: false, error: 'Target month must be 2 or 3' };
  }

  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
  if (!client || client.tunnel_status !== 'active') {
    return { moved: false, error: 'Client is not currently active in the funnel' };
  }
  if (targetMonth <= client.funnel_month) {
    return { moved: false, error: `Client is already on Month ${client.funnel_month}` };
  }

  const campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get(client.campaign_id);
  if (!campaign) return { moved: false, error: 'Campaign not found' };

  const { newMonth, tasksCreated } = await moveClientIntoBonusMonth(client, campaign, targetMonth);

  return { moved: true, newMonth, tasksCreated };
}

/**
 * Immediately move a funnel client straight into the regular client list, skipping
 * whatever months remain. Used by the admin's manual "Move to Normal Clients" action.
 */
export async function graduateFunnelClientNow(clientId) {
  const db = await getDb();
  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
  if (!client || client.tunnel_status !== 'active') return { graduated: false };

  await db.prepare(`
    UPDATE clients SET tunnel_status = 'completed', funnel_month = NULL, funnel_month_end_date = NULL WHERE id = ?
  `).run(clientId);

  return { graduated: true };
}

/**
 * Move several funnel clients straight into the regular client list at once, skipping
 * whatever months remain for each. Used by the admin's "Move Selected to Clients" bulk action.
 */
export async function graduateFunnelClientsNow(clientIds) {
  const graduated = [];
  const skipped = [];

  for (const clientId of clientIds) {
    const result = await graduateFunnelClientNow(clientId);
    if (result.graduated) {
      graduated.push(clientId);
    } else {
      skipped.push(clientId);
    }
  }

  return { graduated, skipped };
}

/**
 * Batch sweep: advance/graduate every active-funnel client in a campaign whose current
 * month has ended, based on the 16-day cycle window. Idempotent — safe to call more
 * than once on the same day.
 *
 * Not called automatically anymore — funnel month advancement is manual only now
 * (see advanceOneFunnelClient, used by the admin's per-client "force advance" action
 * on /admin/funnel). Kept here in case a manual bulk-advance action is wanted later.
 */
export async function runFunnelProgressionForCampaign(campaignId, today = todayStr()) {
  const db = await getDb();

  const dueClients = await db.prepare(`
    SELECT id FROM clients
    WHERE campaign_id = ? AND tunnel_status = 'active' AND funnel_month_end_date IS NOT NULL AND funnel_month_end_date <= ?
  `).all(campaignId, today);

  const result = { advancedToMonth2: [], advancedToMonth3: [], graduated: [] };
  let anyMovedIntoBonusMonth = false;

  // Each client's advancement (advanceOneFunnelClient -> moveClientIntoBonusMonth) is
  // already its own atomic transaction, so the sweep itself doesn't wrap in one more —
  // per-client atomicity is all that's needed here (idempotency handles recovery if the
  // sweep is interrupted). seo_tasks regeneration is skipped per-client here and done
  // once for the whole campaign at the end instead — generateSEOTasks rebuilds every
  // client's tasks regardless of which one triggered it, so calling it once per
  // transitioning client in the same sweep would repeat the same full-campaign work
  // needlessly.
  for (const { id } of dueClients) {
    const before = await db.prepare('SELECT funnel_month FROM clients WHERE id = ?').get(id);
    const outcome = await advanceOneFunnelClient(id, { skipRegeneration: true });
    if (!outcome.advanced) continue;

    if (outcome.graduated) {
      result.graduated.push(id);
    } else if (before.funnel_month === 1) {
      result.advancedToMonth2.push(id);
      anyMovedIntoBonusMonth = true;
    } else if (before.funnel_month === 2) {
      result.advancedToMonth3.push(id);
      anyMovedIntoBonusMonth = true;
    }
  }

  if (anyMovedIntoBonusMonth) {
    await generateSEOTasks(campaignId);
  }

  return result;
}

// Maps the old flat tunnel_tasks categories to the LINK_TYPES keys used by seo_tasks.
// Guest Post has no equivalent in the new week-based Month 1 structure, so its old
// progress isn't carried over.
const MONTH1_CATEGORY_TO_LINK_TYPE = {
  'Citations': 'citation',
  'Profiles': 'profile',
  'Web 2.0': 'web2',
  'Image Submission': 'image',
  'PDF Submission': 'pdf',
};

/**
 * One-time conversion of every client currently active in Month 1 (working the old
 * manual tunnel_tasks checklist) onto the new week-based, Google Sheet-synced
 * seo_tasks system. Each client's already-recorded manual progress (per old category)
 * is carried over into the new rows oldest-week-first — same backfill shape as the
 * completed-links sync — so real progress isn't lost. Old tunnel_tasks rows are left
 * in place (just no longer read) rather than deleted.
 */
export async function migrateMonth1ClientsToSheetSync(campaignId) {
  const db = await getDb();

  const clients = await db.prepare(`
    SELECT id FROM clients WHERE campaign_id = ? AND tunnel_status = 'active' AND funnel_month = 1 AND is_active = 1
  `).all(campaignId);

  if (clients.length === 0) return { migratedClients: 0 };

  // Snapshot each client's old completed-by-category counts before regenerating —
  // generateSEOTasks doesn't touch tunnel_tasks, but reading it after wouldn't be any
  // different; snapshotting first just keeps the two steps clearly separated.
  const carryoverByClient = new Map();
  for (const { id: clientId } of clients) {
    const rows = await db.prepare(`
      SELECT category, COUNT(*) as completedCount
      FROM tunnel_tasks
      WHERE client_id = ? AND funnel_month = 1 AND status = 'completed'
      GROUP BY category
    `).all(clientId);

    const carryover = {};
    for (const row of rows) {
      const linkType = MONTH1_CATEGORY_TO_LINK_TYPE[row.category];
      if (linkType) carryover[linkType] = (carryover[linkType] || 0) + row.completedCount;
    }
    carryoverByClient.set(clientId, carryover);
  }

  await generateSEOTasks(campaignId);

  let migratedClients = 0;
  for (const { id: clientId } of clients) {
    const carryover = carryoverByClient.get(clientId) || {};
    if (Object.keys(carryover).length === 0) continue;

    for (const [linkType, carryCount] of Object.entries(carryover)) {
      if (carryCount <= 0) continue;

      const rows = await db.prepare(`
        SELECT id, target_count FROM seo_tasks
        WHERE campaign_id = ? AND client_id = ? AND link_type = ?
        ORDER BY day_number ASC
      `).all(campaignId, clientId, linkType);

      let remaining = carryCount;
      for (const row of rows) {
        if (remaining <= 0) break;
        const applied = Math.min(row.target_count, remaining);
        await db.prepare('UPDATE seo_tasks SET completed_count = ? WHERE id = ?').run(applied, row.id);
        remaining -= applied;
      }
    }
    migratedClients++;
  }

  return { migratedClients };
}
