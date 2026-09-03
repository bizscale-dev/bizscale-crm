import { getDb } from '@/lib/db';
import Link from 'next/link';
import WebSeoAssociateDetail from '@/components/team-progress/WebSeoAssociateDetail';

export const revalidate = 0;

/**
 * A Web SEO associate's full dashboard, scoped to one specific Web SEO campaign —
 * reachable by clicking an associate's "View" link from a campaign's read-only
 * report page (src/app/admin/web-clients/campaigns/[id]/page.js). Explicitly
 * loads the campaign by id (rather than WebSeoAssociateDetail's default of
 * "whichever campaign is active") so this still shows a past/completed
 * campaign's real numbers correctly, even once a different one is active.
 */
export default async function WebSeoCampaignAssociateDashboardPage({ params }) {
  const { id, associateId } = await params;
  const db = await getDb();
  const campaignId = parseInt(id, 10);

  const campaign = await db.prepare('SELECT * FROM webseo_campaigns WHERE id = ?').get(campaignId);

  if (!campaign) {
    return (
      <div className="card">
        <p style={{ color: 'var(--danger)', margin: 0 }}>Web SEO campaign not found.</p>
        <Link href="/admin/web-clients" style={{ color: 'var(--primary)', fontSize: '0.875rem' }}>← Back to Web Clients</Link>
      </div>
    );
  }

  return (
    <WebSeoAssociateDetail
      id={associateId}
      campaign={campaign}
      backHref={`/admin/web-clients/campaigns/${id}`}
      backLabel={campaign.name}
    />
  );
}
