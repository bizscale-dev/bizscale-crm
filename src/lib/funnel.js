import { getDb } from './db';
import { FUNNEL_MONTH1_ITEMS } from './funnelConstants';
import { computeFunnelMonth1Window, computeFunnelNextMonthWindow } from './campaign-cycle';
import { generateSEOTasks } from './taskService';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Seed the campaign's Month 1 template library (tunnel_templates, week_number = 0)
 * from the hardcoded FUNNEL_MONTH1_ITEMS list, if it hasn't been seeded yet.
 */
export async function seedMonth1TemplatesIfMissing(campaignId) {
  const db = await getDb();

  const existing = await db.prepare(
    'SELECT COUNT(*) as c FROM tunnel_templates WHERE campaign_id = ? AND week_number = 0'
  ).get(campaignId);

  if (existing.c > 0) return 0;

  const insertSql = `
    INSERT INTO tunnel_templates (campaign_id, week_number, category, platform, url, note, order_in_week)
    VALUES (?, 0, ?, ?, ?, ?, ?)
  `;
  await db.batch(FUNNEL_MONTH1_ITEMS.map((item, idx) => ({
    sql: insertSql,
    args: [campaignId, item.category, item.platform, item.url, item.note, idx],
  })));

  return FUNNEL_MONTH1_ITEMS.length;
}

/**
 * Enroll a client into the Funnel: sets month-1 window on the client row and
 * instantiates their month-1 checklist from the campaign's template library.
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

  const templates = await db.prepare(`
    SELECT * FROM tunnel_templates WHERE campaign_id = ? AND week_number = 0
    ORDER BY order_in_week
  `).all(campaignId);

  if (templates.length > 0) {
    const insertSql = `
      INSERT INTO tunnel_tasks (campaign_id, client_id, week_number, funnel_month, category, platform, url, note, status)
      VALUES (?, ?, 0, 1, ?, ?, ?, ?, 'pending')
    `;
    await db.batch(templates.map(t => ({
      sql: insertSql,
      args: [campaignId, clientId, t.category, t.platform, t.url, t.note],
    })));
  }

  return { monthEndDate, tasksCreated: templates.length };
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
 * Daily sweep: advance/graduate every active-funnel client in a campaign whose current
 * month has ended. Idempotent — safe to call more than once on the same day.
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
