import { getDb } from '@/lib/db';
import Link from 'next/link';
import WriterDetail from '@/components/team-progress/WriterDetail';

export const revalidate = 0;

/**
 * A writer's full dashboard, scoped to one specific Writer campaign — reachable
 * by clicking a writer's "View" link from a campaign's read-only report page
 * (src/app/admin/writers/campaigns/[id]/page.js). Explicitly loads the campaign
 * by id (rather than WriterDetail's default of "whichever campaign is active")
 * so this still shows a past/completed campaign's real numbers correctly, even
 * once a different one is active.
 */
export default async function WriterCampaignWriterDashboardPage({ params }) {
  const { id, writerId } = await params;
  const db = await getDb();
  const campaignId = parseInt(id, 10);

  const campaign = await db.prepare('SELECT * FROM writer_campaigns WHERE id = ?').get(campaignId);

  if (!campaign) {
    return (
      <div className="card">
        <p style={{ color: 'var(--danger)', margin: 0 }}>Writer campaign not found.</p>
        <Link href="/admin/writers" style={{ color: 'var(--primary)', fontSize: '0.875rem' }}>← Back to Writers</Link>
      </div>
    );
  }

  return (
    <WriterDetail
      id={writerId}
      campaign={campaign}
      backHref={`/admin/writers/campaigns/${id}`}
      backLabel={campaign.name || `Writer Campaign #${campaign.id}`}
    />
  );
}
