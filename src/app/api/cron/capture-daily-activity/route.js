import { captureDailyActivity } from '@/lib/dailyActivityCapture';
import { logSyncRun } from '@/lib/syncLog';

// 60s is the max allowed on Vercel's Hobby plan — see src/app/api/cron/daily-sync/route.js
export const maxDuration = 60;

/**
 * GET /api/cron/capture-daily-activity
 *
 * Freezes the day's work into daily_activity_log (see src/lib/dailyActivityCapture.js)
 * — a permanent snapshot the "By Person" report on the admin Reports page reads
 * from, instead of recalculating live off the task tables every time (which was
 * prone to a day's number silently drifting later as unrelated syncs ran).
 *
 * Scheduled for 12:10 AM local team time (see vercel.json) — by then the day's
 * final evening sync has already landed, and the server's current UTC calendar
 * date is still the day that just closed out locally, so we capture "today"
 * (not "yesterday") from the server's own clock.
 */
export async function GET(request) {
  const authHeader = request.headers.get('authorization');

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const captureDate = new Date().toISOString().split('T')[0];
    console.log('[CRON] Daily activity capture triggered at', new Date().toISOString(), 'for', captureDate);

    const count = await captureDailyActivity(captureDate);

    await logSyncRun('daily-activity-capture', 'success', `Captured ${count} activity record(s) for ${captureDate}`);

    return Response.json({ success: true, date: captureDate, count });
  } catch (err) {
    console.error('[CRON] Daily activity capture failed:', err);
    await logSyncRun('daily-activity-capture', 'error', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
