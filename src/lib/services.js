import { getDb } from './db';
import {
  DEFAULT_LINK_TARGETS,
  LINK_TYPE_TARGET_FIELDS,
  LINK_TYPES,
} from './linkTargetConstants';

export { LINK_TYPES, LINK_TYPE_TARGET_FIELDS, DEFAULT_LINK_TARGETS };

export const LINK_TYPE_LABELS = {
  web2: 'Web 2.0',
  guestpost: 'Guest Post',
  pdf: 'PDF Submission',
  profile: 'Profile Creation',
  citation: 'Citation/Directory',
  image: 'Image Submission',
};

export function getLinkTargetsFromCampaign(campaign) {
  if (!campaign) return [];

  return LINK_TYPES.map((linkType) => ({
    linkType,
    label: LINK_TYPE_LABELS[linkType],
    target: campaign[LINK_TYPE_TARGET_FIELDS[linkType]] ?? 0,
  }));
}

export function getTotalLinksPerClient(campaign) {
  if (!campaign) return 0;

  return LINK_TYPES.reduce(
    (sum, linkType) => sum + (campaign[LINK_TYPE_TARGET_FIELDS[linkType]] ?? 0),
    0
  );
}

export async function getActiveCampaign() {
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM campaigns WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
  return row ? { ...row } : null;
}

export async function getActiveWriterCampaign() {
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM writer_campaigns WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
  return row ? { ...row } : null;
}

export async function getCampaignProgress(campaignId) {
  const db = await getDb();

  const seoProgress = (await db.prepare(`
    SELECT
      SUM(target_count) as total_target,
      SUM(completed_count) as total_completed,
      link_type,
      associate_id,
      u.name as associate_name
    FROM seo_tasks st
    JOIN users u ON u.id = st.associate_id
    WHERE st.campaign_id = ?
    GROUP BY associate_id, link_type
  `).all(campaignId)).map(r => ({ ...r }));

  const writingProgress = (await db.prepare(`
    SELECT
      SUM(target_count) as total_target,
      SUM(completed_count) as total_completed,
      post_type,
      writer_id,
      u.name as writer_name
    FROM writing_tasks wt
    JOIN users u ON u.id = wt.writer_id
    WHERE wt.campaign_id = ?
    GROUP BY writer_id, post_type
  `).all(campaignId)).map(r => ({ ...r }));

  const seoTotals = await db.prepare(`
    SELECT SUM(target_count) as target, SUM(completed_count) as completed
    FROM seo_tasks WHERE campaign_id = ?
  `).get(campaignId);

  const writingTotals = await db.prepare(`
    SELECT SUM(target_count) as target, SUM(completed_count) as completed
    FROM writing_tasks WHERE campaign_id = ?
  `).get(campaignId);

  return {
    seoProgress,
    writingProgress,
    seoTotals: seoTotals ? { ...seoTotals } : null,
    writingTotals: writingTotals ? { ...writingTotals } : null
  };
}

