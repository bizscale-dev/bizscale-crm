'use server';

import { getDb } from '@/lib/db';
import { LINK_TYPES } from '@/lib/linkTargetConstants';
import { enrollClientInFunnel, advanceOneFunnelClient, advanceMonth1Week, jumpFunnelClientToMonth, graduateFunnelClientNow, graduateFunnelClientsNow, enrollHeldClientAtMonth, moveHeldClientToNormal } from '@/lib/funnel';
import { revalidatePath } from 'next/cache';

export async function addFunnelTemplate(campaignId, templateData) {
  const db = await getDb();

  try {
    const maxOrder = await db.prepare(`
      SELECT MAX(order_in_week) as max_order
      FROM tunnel_templates
      WHERE campaign_id = ? AND week_number = ? AND category = ?
    `).get(campaignId, templateData.week_number, templateData.category);

    const order = (maxOrder.max_order || -1) + 1;

    await db.prepare(`
      INSERT INTO tunnel_templates (
        campaign_id, week_number, category, platform, url, note, order_in_week
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      campaignId,
      templateData.week_number,
      templateData.category,
      templateData.platform,
      templateData.url,
      templateData.note,
      order
    );

    revalidatePath('/admin/funnel');
    return { success: 'Platform added successfully' };
  } catch (err) {
    return { error: err.message };
  }
}

export async function deleteFunnelTemplate(templateId) {
  const db = await getDb();

  try {
    await db.prepare('DELETE FROM tunnel_templates WHERE id = ?').run(templateId);
    revalidatePath('/admin/funnel');
    return { success: 'Platform removed' };
  } catch (err) {
    return { error: err.message };
  }
}

export async function enrollClientInFunnelAction(clientId, campaignId, startWeek = 1) {
  try {
    await enrollClientInFunnel(clientId, campaignId, undefined, startWeek);
    revalidatePath('/admin/funnel');
    revalidatePath('/admin/clients');
    revalidatePath('/admin/tasks');
    return { success: `Client enrolled in Funnel Month 1${startWeek > 1 ? `, starting at Week ${startWeek}` : ''}` };
  } catch (err) {
    return { error: err.message };
  }
}

// Manual escape hatch: advance a Month 1 client's current week by one (see
// advanceMonth1Week in src/lib/funnel.js) instead of waiting for a manual month-level
// advance — prior weeks' history stays generated, only the current week moves forward.
export async function advanceMonth1WeekAction(clientId) {
  try {
    const result = await advanceMonth1Week(clientId);
    if (!result.advanced) {
      return { error: result.error || 'Could not advance week' };
    }
    revalidatePath('/admin/funnel');
    revalidatePath('/admin/tasks');
    return { success: `Client advanced to Week ${result.newWeek}` };
  } catch (err) {
    return { error: err.message };
  }
}

// A held client can skip straight to Funnel Month 2 or 3 instead of starting at
// Month 1 — used by the "On Hold" section's Month 2/3 buttons.
export async function enrollHeldClientAtMonthAction(clientId, campaignId, targetMonth) {
  try {
    const result = await enrollHeldClientAtMonth(clientId, campaignId, targetMonth);
    if (!result.moved) {
      return { error: result.error || 'Could not move client' };
    }
    revalidatePath('/admin/funnel');
    revalidatePath('/admin/clients');
    revalidatePath('/admin/tasks');
    return { success: `Client placed directly into Month ${result.newMonth} (${result.tasksCreated} tasks created)` };
  } catch (err) {
    return { error: err.message };
  }
}

// A held client can also skip the Funnel entirely and go straight into the normal
// client list — used by the "On Hold" section's "Move to Regular Clients" button.
export async function moveHeldClientToNormalAction(clientId, campaignId) {
  try {
    const result = await moveHeldClientToNormal(clientId, campaignId);
    if (!result.moved) {
      return { error: result.error || 'Could not move client' };
    }
    revalidatePath('/admin/funnel');
    revalidatePath('/admin/clients');
    revalidatePath('/admin/tasks');
    return { success: 'Client moved to the normal client list' };
  } catch (err) {
    return { error: err.message };
  }
}

// Manual escape hatch: force a client to advance to their next funnel month (or
// graduate, if already in month 3) instead of waiting for the daily cron sweep.
export async function forceAdvanceFunnelClientAction(clientId) {
  try {
    const result = await advanceOneFunnelClient(clientId);
    if (!result.advanced) {
      return { error: 'Client is not currently active in the funnel' };
    }
    revalidatePath('/admin/funnel');
    revalidatePath('/admin/clients');
    revalidatePath('/admin/tasks');
    return { success: result.graduated ? 'Client graduated to the main campaign' : `Client advanced to Month ${result.newMonth}` };
  } catch (err) {
    return { error: err.message };
  }
}

// Manual escape hatch: jump a client straight to Month 2 or 3, skipping any month
// in between — generates only the target month's tasks (using the campaign's
// Month 2 & 3 Bonus Link Targets as the whole target for that month, tracked
// through seo_tasks day-by-day and Google Sheet-synced like a normal client),
// the skipped month's tasks are never created.
export async function jumpFunnelClientToMonthAction(clientId, targetMonth) {
  try {
    const result = await jumpFunnelClientToMonth(clientId, targetMonth);
    if (!result.moved) {
      return { error: result.error || 'Could not move client' };
    }
    revalidatePath('/admin/funnel');
    revalidatePath('/admin/clients');
    revalidatePath('/admin/tasks');
    return { success: `Client moved to Month ${result.newMonth} (${result.tasksCreated} tasks created)` };
  } catch (err) {
    return { error: err.message };
  }
}

// Skip whatever funnel months remain and move a client straight into the regular
// client list right now, instead of advancing one month at a time.
export async function moveFunnelClientToNormalAction(clientId) {
  try {
    const result = await graduateFunnelClientNow(clientId);
    if (!result.graduated) {
      return { error: 'Client is not currently active in the funnel' };
    }
    revalidatePath('/admin/funnel');
    revalidatePath('/admin/clients');
    revalidatePath('/admin/tasks');
    return { success: 'Client moved to the normal client list' };
  } catch (err) {
    return { error: err.message };
  }
}

// Move several funnel clients straight into the regular client list in one go.
export async function moveFunnelClientsToNormalAction(clientIds) {
  try {
    if (!Array.isArray(clientIds) || clientIds.length === 0) {
      return { error: 'No clients selected' };
    }

    const result = await graduateFunnelClientsNow(clientIds);
    revalidatePath('/admin/funnel');
    revalidatePath('/admin/clients');
    revalidatePath('/admin/tasks');

    if (result.graduated.length === 0) {
      return { error: 'None of the selected clients were active in the funnel' };
    }

    return {
      success: `${result.graduated.length} client${result.graduated.length === 1 ? '' : 's'} moved to the normal client list`
        + (result.skipped.length > 0 ? ` (${result.skipped.length} skipped — no longer active in the funnel)` : ''),
    };
  } catch (err) {
    return { error: err.message };
  }
}

export async function updateFunnelBonusTargets(campaignId, formData) {
  const db = await getDb();

  try {
    const values = LINK_TYPES.map((type) => parseInt(formData.get(type), 10) || 0);

    await db.prepare(`
      UPDATE campaigns SET
        funnel_bonus_web2 = ?,
        funnel_bonus_guestpost = ?,
        funnel_bonus_pdf = ?,
        funnel_bonus_profile = ?,
        funnel_bonus_citation = ?,
        funnel_bonus_image = ?
      WHERE id = ?
    `).run(...values, campaignId);

    revalidatePath('/admin/funnel');
    return { success: 'Bonus link targets updated' };
  } catch (err) {
    return { error: err.message };
  }
}
