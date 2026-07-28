import { getActiveCampaign } from '@/lib/services';
import { runWriterOffpageSync } from '@/lib/writerOffpageSync';
import { logSyncRun } from '@/lib/syncLog';
import { revalidatePath } from 'next/cache';

// 60s is the max allowed on Vercel's Hobby plan — see src/app/api/cron/daily-sync/route.js
// for why this matters (a killed function fails silently with no error surfaced).
export const maxDuration = 60;

/**
 * GET /api/cron/sync-writer-offpage
 *
 * Reads the GBP-Off Page / Web-Off Page writer task sheets (see
 * src/lib/writerOffpageSync.js) and rebuilds writer assignments/tasks from them.
 * See vercel.json for the schedule (staggered alongside the other daily sync
 * triggers). Also run once synchronously on campaign creation
 * (src/app/admin/campaign/actions.js) and manually via the admin Writers page.
 */
export async function GET(request) {
  const authHeader = request.headers.get('authorization');

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[CRON] Writer off-page sync triggered at', new Date().toISOString());

    const campaign = await getActiveCampaign();
    if (!campaign) {
      await logSyncRun('writer-offpage', 'error', 'No active campaign');
      return Response.json({ error: 'No active campaign' }, { status: 400 });
    }

    const result = await runWriterOffpageSync(campaign.id);

    revalidatePath('/writer/tasks');
    revalidatePath('/writer');
    revalidatePath('/admin/writers');

    const failed = Object.entries(result).filter(([, r]) => !r.success);
    const summary = Object.entries(result)
      .map(([type, r]) => r.success ? `${type}: ${r.clientCount} clients, ${r.taskCount} tasks` : `${type}: failed (${r.error})`)
      .join('; ');

    await logSyncRun('writer-offpage', failed.length > 0 ? 'error' : 'success', summary, result);

    return Response.json({ success: true, result, triggeredAt: new Date().toISOString() });
  } catch (err) {
    console.error('[CRON] Writer off-page sync failed:', err);
    await logSyncRun('writer-offpage', 'error', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
