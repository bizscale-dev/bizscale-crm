import { runSyncJob } from '@/lib/cron-scheduler';
import { logSyncRun } from '@/lib/syncLog';

// Vercel kills a serverless function once it exceeds its execution time limit —
// silently, with no error surfaced to the caller — which is exactly what caused this
// route's completed-links steps to sometimes never run before they were split into
// their own cron triggers. 60s is the max allowed on Vercel's Hobby plan; raise this
// if the project is ever upgraded to a plan with a higher ceiling.
export const maxDuration = 60;

/**
 * GET /api/cron/daily-sync
 *
 * Entry point for Vercel Cron (see vercel.json — scheduled twice daily: 09:00 UTC =
 * 2 PM Pakistan Time, and 18:50 UTC = 11:50 PM Pakistan Time). Vercel automatically
 * sends `Authorization: Bearer $CRON_SECRET`
 * on cron-triggered requests when CRON_SECRET is set as a project env var; requests
 * without a matching header are rejected so this endpoint can't be triggered by anyone
 * who finds the URL.
 */
export async function GET(request) {
  const authHeader = request.headers.get('authorization');

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[CRON] Daily sync triggered at', new Date().toISOString());
    const result = await runSyncJob();

    if (result?.skipped) {
      await logSyncRun('daily-sync', 'success', `Skipped: ${result.reason}`);
    } else if (result?.error) {
      await logSyncRun('daily-sync', 'error', result.error, { campaignResults: result.campaignResults });
    } else {
      const failed = (result?.campaignResults || []).filter(c => c.status === 'error');
      const names = (result?.campaignResults || []).map(c => c.name).join(', ') || 'no campaigns';
      const summary = failed.length > 0
        ? `Synced with errors: ${names} (${failed.length} failed)`
        : `Synced ${result?.campaignResults?.length || 0} campaign(s): ${names}`;
      await logSyncRun('daily-sync', failed.length > 0 ? 'error' : 'success', summary, { campaignResults: result?.campaignResults });
    }

    return Response.json({ success: true, triggeredAt: new Date().toISOString(), result });
  } catch (err) {
    console.error('[CRON] Daily sync failed:', err);
    await logSyncRun('daily-sync', 'error', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
