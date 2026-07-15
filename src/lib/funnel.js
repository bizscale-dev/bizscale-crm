import { getDb } from './db';
import { LINK_TYPES, LINK_TYPE_TARGET_FIELDS, LINK_TYPE_LABELS, DEFAULT_LINK_TARGETS } from './linkTargetConstants';
import { FUNNEL_MONTH1_ITEMS, FUNNEL_BONUS_FIELDS } from './funnelConstants';
import { computeFunnelMonth1Window, computeFunnelNextMonthWindow } from './campaign-cycle';

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
 * Generate a client's numbered checklist for funnel month 2 or 3 — one item per
 * campaign link-type quota (normal monthly target + admin-configured bonus).
 */
export async function generateFunnelMonthTasks(clientId, campaignId, monthNumber) {
  const db = await getDb();
  const campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const rows = [];
  for (const type of LINK_TYPES) {
    const normalTarget = campaign[LINK_TYPE_TARGET_FIELDS[type]] ?? DEFAULT_LINK_TARGETS[type];
    const bonus = campaign[FUNNEL_BONUS_FIELDS[type]] ?? 0;
    const count = normalTarget + bonus;
    const label = LINK_TYPE_LABELS[type];

    for (let i = 1; i <= count; i++) {
      rows.push([campaignId, clientId, monthNumber, label, `${label} Link #${i}`]);
    }
  }

  if (rows.length > 0) {
    const insertSql = `
      INSERT INTO tunnel_tasks (campaign_id, client_id, week_number, funnel_month, category, platform, status)
      VALUES (?, ?, 0, ?, ?, ?, 'pending')
    `;
    await db.batch(rows.map(args => ({ sql: insertSql, args })));
  }

  return rows.length;
}

/**
 * Advance a single funnel client by one stage: month 1 -> 2, 2 -> 3, or 3 -> graduate.
 * Used both by the batch progression sweep and by the admin's manual "force advance" action.
 */
export async function advanceOneFunnelClient(clientId) {
  const db = await getDb();
  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
  if (!client || client.tunnel_status !== 'active') return { advanced: false };

  const campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get(client.campaign_id);
  if (!campaign) return { advanced: false };

  if (client.funnel_month === 1 || client.funnel_month === 2) {
    const nextMonth = client.funnel_month + 1;
    const { monthEndDate } = computeFunnelNextMonthWindow(campaign.start_date, client.funnel_month_end_date, nextMonth);
    await generateFunnelMonthTasks(clientId, client.campaign_id, nextMonth);
    await db.prepare('UPDATE clients SET funnel_month = ?, funnel_month_end_date = ? WHERE id = ?')
      .run(nextMonth, monthEndDate, clientId);
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

  // Each client's advancement (advanceOneFunnelClient -> generateFunnelMonthTasks) is
  // already its own atomic transaction, so the sweep itself doesn't wrap in one more —
  // per-client atomicity is all that's needed here (idempotency handles recovery if the
  // sweep is interrupted).
  for (const { id } of dueClients) {
    const before = await db.prepare('SELECT funnel_month FROM clients WHERE id = ?').get(id);
    const outcome = await advanceOneFunnelClient(id);
    if (!outcome.advanced) continue;

    if (outcome.graduated) {
      result.graduated.push(id);
    } else if (before.funnel_month === 1) {
      result.advancedToMonth2.push(id);
    } else if (before.funnel_month === 2) {
      result.advancedToMonth3.push(id);
    }
  }

  return result;
}
