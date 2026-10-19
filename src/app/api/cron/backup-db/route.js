import { backupDatabase } from '@/lib/backupDb';
import { logSyncRun } from '@/lib/syncLog';

export const maxDuration = 60;

/**
 * GET /api/cron/backup-db
 *
 * Mirrors the production database into the backup database (BACKUP_DATABASE_URL)
 * once a day, so a bad migration or accidental delete can be recovered from
 * the backup. Production is read-only here. See src/lib/backupDb.js.
 */
export async function GET(request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await backupDatabase({
      sourceUrl: process.env.TURSO_DATABASE_URL,
      sourceToken: process.env.TURSO_AUTH_TOKEN,
      backupUrl: process.env.BACKUP_DATABASE_URL,
      backupToken: process.env.BACKUP_AUTH_TOKEN,
    });
    await logSyncRun('db-backup', 'success', `Backed up ${result.rows} row(s) across ${result.tables} table(s)`);
    return Response.json({ success: true, tables: result.tables, rows: result.rows });
  } catch (err) {
    console.error('[CRON] DB backup failed:', err);
    await logSyncRun('db-backup', 'error', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
