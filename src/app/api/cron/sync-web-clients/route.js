import { getDb } from '@/lib/db';
import { runWebClientsImport } from '@/lib/webClientsImport';
import { logSyncRun } from '@/lib/syncLog';
import { revalidatePath } from 'next/cache';

// 60s is the max allowed on Vercel's Hobby plan — see src/app/api/cron/daily-sync/route.js
// for why this matters (a killed function fails silently with no error surfaced).
export const maxDuration = 60;

/**
 * GET /api/cron/sync-web-clients
 *
 * Automatic counterpart to the manual "Import Web Clients" button on
 * /admin/web-clients (src/app/admin/web-clients/actions.js) — same underlying import
 * (src/lib/webClientsImport.js), just triggered on a schedule instead of by a click, so
 * a client added or removed from the Web Clients sheet shows up without anyone having to
 * remember to press the button. See vercel.json for the schedule (staggered a couple
 * minutes after the other daily sync triggers).
 */
export async function GET(request) {
  const authHeader = request.headers.get('authorization');

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[CRON] Web clients sync triggered at', new Date().toISOString());

    const db = await getDb();
    const settings = await db.prepare("SELECT value FROM settings WHERE key = ?").get('web_clients_import_sheet_url');
    const sheetUrl = settings?.value;

    if (!sheetUrl) {
      const msg = 'No Google Sheet URL configured. Set it in Admin → Web Clients first.';
      await logSyncRun('web-clients', 'error', msg);
      return Response.json({ error: msg }, { status: 400 });
    }

    const result = await runWebClientsImport(sheetUrl);

    revalidatePath('/admin/web-clients');
    revalidatePath('/admin/web-seo-associates');
    revalidatePath('/admin');

    await logSyncRun('web-clients', 'success', result.message, {
      importedCount: result.importedCount,
      reactivatedCount: result.reactivatedCount,
      deactivatedCount: result.deactivatedCount,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });

    return Response.json({ success: true, message: result.message, triggeredAt: new Date().toISOString() });
  } catch (err) {
    console.error('[CRON] Web clients sync failed:', err);
    await logSyncRun('web-clients', 'error', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
