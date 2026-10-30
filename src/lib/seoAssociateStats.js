import { getTotalLinksPerClient } from '@/lib/services';
import { LINK_TYPES } from '@/lib/linkTargetConstants';
import { FUNNEL_BONUS_FIELDS } from '@/lib/funnelConstants';

// One definition of an SEO associate's "Total Expected Links", shared by the
// SEO Associates list (SeoAssociatesTable) and the associate's own dashboard
// (SeoAssociateDetail) so the two can never disagree:
//   active regular clients (not funnel, not on hold) x the campaign's monthly links
//   per client, plus Month 2 / Month 3 funnel clients x the campaign's bonus targets.
// Funnel Month 1 is excluded (it has its own checklist).
export function expectedLinksFor(campaign, { regularClients, funnelM2, funnelM3 }) {
  if (!campaign) return 0;
  const bonusPerClient = LINK_TYPES.reduce((sum, type) => sum + (campaign[FUNNEL_BONUS_FIELDS[type]] || 0), 0);
  return regularClients * getTotalLinksPerClient(campaign) + (funnelM2 + funnelM3) * bonusPerClient;
}

// Completed links: the live sum of seo_tasks.completed_count, Month 1 funnel excluded.
export async function liveCompletedLinks(db, campaignId, associateId) {
  const row = await db.prepare(`
    SELECT COALESCE(SUM(st.completed_count), 0) as completed
    FROM seo_tasks st JOIN clients c ON c.id = st.client_id
    WHERE st.associate_id = ? AND st.campaign_id = ?
      AND NOT (c.tunnel_status = 'active' AND c.funnel_month = 1)
  `).get(associateId, campaignId);
  return row?.completed || 0;
}
