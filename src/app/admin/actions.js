'use server';

import { getDb } from '@/lib/db';
import {
  DEFAULT_LINK_TARGETS,
  LINK_TYPE_TARGET_FIELDS,
  LINK_TYPES,
} from '@/lib/linkTargetConstants';
import { getActiveCampaign } from '@/lib/services';
import { revalidatePath } from 'next/cache';

async function requireActiveCampaign() {
  const campaign = await getActiveCampaign();
  if (!campaign) return { error: 'No active campaign' };
  return { campaign };
}

function validateLinkType(linkType) {
  if (!LINK_TYPES.includes(linkType)) {
    return { error: 'Invalid link type' };
  }
  return { field: LINK_TYPE_TARGET_FIELDS[linkType] };
}

async function syncLinksPerClient(db, campaignId) {
  const campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  const total = LINK_TYPES.reduce(
    (sum, linkType) => sum + (campaign[LINK_TYPE_TARGET_FIELDS[linkType]] ?? 0),
    0
  );
  await db.prepare('UPDATE campaigns SET links_per_client = ? WHERE id = ?').run(total, campaignId);
}

export async function createLinkTarget(prevState, formData) {
  const access = await requireActiveCampaign();
  if (access.error) return { error: access.error };

  const linkType = formData.get('link_type');
  const target = parseInt(formData.get('target'), 10);

  const validated = validateLinkType(linkType);
  if (validated.error) return { error: validated.error };
  if (Number.isNaN(target) || target < 0) {
    return { error: 'Target must be a number greater than or equal to 0' };
  }

  const db = await getDb();
  const current = await db
    .prepare(`SELECT ${validated.field} as target FROM campaigns WHERE id = ?`)
    .get(access.campaign.id);

  if (current?.target > 0 && target === 0) {
    return { error: 'Use Delete to remove a link target.' };
  }

  try {
    await db.prepare(`UPDATE campaigns SET ${validated.field} = ? WHERE id = ?`).run(
      target,
      access.campaign.id
    );
    await syncLinksPerClient(db, access.campaign.id);
    revalidatePath('/admin');
    revalidatePath('/admin/campaign');
    return { success: 'Link target created' };
  } catch (err) {
    return { error: err.message };
  }
}

export async function updateLinkTarget(prevState, formData) {
  const access = await requireActiveCampaign();
  if (access.error) return { error: access.error };

  const linkType = formData.get('link_type');
  const target = parseInt(formData.get('target'), 10);

  const validated = validateLinkType(linkType);
  if (validated.error) return { error: validated.error };
  if (Number.isNaN(target) || target < 0) {
    return { error: 'Target must be a number greater than or equal to 0' };
  }

  try {
    const db = await getDb();
    await db.prepare(`UPDATE campaigns SET ${validated.field} = ? WHERE id = ?`).run(
      target,
      access.campaign.id
    );
    await syncLinksPerClient(db, access.campaign.id);
    revalidatePath('/admin');
    revalidatePath('/admin/campaign');
    return { success: 'Link target updated' };
  } catch (err) {
    return { error: err.message };
  }
}

export async function deleteLinkTarget(linkType) {
  const access = await requireActiveCampaign();
  if (access.error) return { error: access.error };

  const validated = validateLinkType(linkType);
  if (validated.error) return { error: validated.error };

  try {
    const db = await getDb();
    await db.prepare(`UPDATE campaigns SET ${validated.field} = 0 WHERE id = ?`).run(access.campaign.id);
    await syncLinksPerClient(db, access.campaign.id);
    revalidatePath('/admin');
    revalidatePath('/admin/campaign');
    return { success: 'Link target removed' };
  } catch (err) {
    return { error: err.message };
  }
}

export async function resetLinkTargetsToDefaults() {
  const access = await requireActiveCampaign();
  if (access.error) return { error: access.error };

  try {
    const db = await getDb();
    await db.prepare(`
      UPDATE campaigns SET
        web2_target = ?,
        guestpost_target = ?,
        pdf_target = ?,
        profile_target = ?,
        citation_target = ?,
        image_target = ?
      WHERE id = ?
    `).run(
      DEFAULT_LINK_TARGETS.web2,
      DEFAULT_LINK_TARGETS.guestpost,
      DEFAULT_LINK_TARGETS.pdf,
      DEFAULT_LINK_TARGETS.profile,
      DEFAULT_LINK_TARGETS.citation,
      DEFAULT_LINK_TARGETS.image,
      access.campaign.id
    );
    await syncLinksPerClient(db, access.campaign.id);
    revalidatePath('/admin');
    revalidatePath('/admin/campaign');
    return { success: 'Link targets reset to defaults' };
  } catch (err) {
    return { error: err.message };
  }
}
