import { runSyncJob } from '@/lib/cron-scheduler';

/**
 * GET /api/cron/daily-sync
 *
 * Entry point for Vercel Cron (see vercel.json — scheduled for 18:30 UTC = 11:30 PM
 * Pakistan Time daily). Vercel automatically sends `Authorization: Bearer $CRON_SECRET`
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
    await runSyncJob();
    return Response.json({ success: true, triggeredAt: new Date().toISOString() });
  } catch (err) {
    console.error('[CRON] Daily sync failed:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
