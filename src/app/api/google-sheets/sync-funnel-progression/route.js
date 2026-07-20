import { getDb, initDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import { runFunnelProgressionForCampaign } from '@/lib/funnel';

// 60s is the max allowed on Vercel's Hobby plan — see src/app/api/cron/daily-sync/route.js
// for why this matters (a killed function fails silently with no error surfaced). This
// route is called internally as part of that chain.
export const maxDuration = 60;

export async function POST(request) {
  try {
    await initDb();
    const db = await getDb();

    const { campaignId } = await request.json().catch(() => ({}));

    let campaign = null;
    if (campaignId) {
      campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    } else {
      campaign = await getActiveCampaign();
    }

    if (!campaign) {
      return Response.json({ error: 'No active campaign' }, { status: 400 });
    }

    const result = await runFunnelProgressionForCampaign(campaign.id);

    return Response.json({ success: true, campaignId: campaign.id, ...result });
  } catch (error) {
    console.error('Funnel progression error:', error);
    return Response.json(
      { error: 'funnel_progression_error', message: error.message },
      { status: 500 }
    );
  }
}
