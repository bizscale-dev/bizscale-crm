import { getDb } from '@/lib/db';
import Link from 'next/link';
import SeoAssociateDetail from '@/components/team-progress/SeoAssociateDetail';

export const revalidate = 0;

/**
 * An SEO associate's full dashboard (every card + the daily/weekly summaries),
 * scoped to one specific campaign — reachable by clicking an associate's "View
 * Dashboard" link from a campaign's read-only report page
 * (src/app/admin/campaign/[id]/page.js). Explicitly loads the campaign by id
 * (rather than SeoAssociateDetail's default of "whichever campaign is active")
 * so this still shows a past/completed campaign's real numbers correctly, even
 * once a different campaign has since become active.
 */
export default async function CampaignAssociateDashboardPage({ params, searchParams }) {
  const { id, associateId } = await params;
  const resolvedSearchParams = await searchParams;
  const db = await getDb();
  const campaignId = parseInt(id, 10);

  const campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);

  if (!campaign) {
    return (
      <div className="card">
        <p style={{ color: 'var(--danger)', margin: 0 }}>Campaign not found.</p>
        <Link href="/admin/campaign" style={{ color: 'var(--primary)', fontSize: '0.875rem' }}>← Back to Campaigns</Link>
      </div>
    );
  }

  return (
    <SeoAssociateDetail
      id={associateId}
      campaign={campaign}
      backHref={`/admin/campaign/${id}`}
      backLabel={campaign.name}
      showFunnelLink
      showLegacyTasksView
      basePath={`/admin/campaign/${id}/associates/${associateId}`}
      selectedDate={resolvedSearchParams?.date}
    />
  );
}
