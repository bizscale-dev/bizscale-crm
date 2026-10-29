import { runClientOnboardingSync } from '@/lib/clientOnboardingSync';
import { logSyncRun } from '@/lib/syncLog';
import { revalidatePath } from 'next/cache';

export const maxDuration = 60;

/**
 * GET /api/cron/sync-client-onboarding
 *
 * Runs every day at 4:00 PM Pakistan time (VPS scheduler). Reads the SEO clients
 * sheet and, for every client it hasn't seen before, creates the onboarding
 * checklist for the owning SEO manager. Has no link to the clients table,
 * campaigns or task generation — see src/lib/clientOnboardingSync.js.
 */
export async function GET(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runClientOnboardingSync();
    revalidatePath('/admin/manager-tasks');

    const summary = result.newClients.length
      ? `${result.newClients.length} new client(s): ${result.newClients.map((c) => `${c.name} (${c.tasks} tasks)`).join(', ')}`
      : `No new clients (${result.sheetClients} on sheet)`;
    await logSyncRun('client-onboarding', 'success', summary, result);
    return Response.json({ success: true, result });
  } catch (err) {
    console.error('[CRON] Client onboarding sync failed:', err);
    await logSyncRun('client-onboarding', 'error', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
