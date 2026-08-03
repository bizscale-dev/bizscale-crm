import { getDb } from './db';

/**
 * Record the outcome of a sync trigger run (manual click or Vercel Cron) so the admin
 * UI can show "did the last trigger actually run, and what happened" — otherwise that's
 * only visible in Vercel's function logs, which isn't somewhere an admin normally looks.
 *
 * @param {string} syncType - short identifier, e.g. 'daily-sync', 'completed-links', 'webseo-completed-links'
 * @param {'success'|'error'} status
 * @param {string} summary - one-line human-readable outcome
 * @param {object} [details] - optional extra structured info (counts, errors, etc.)
 */
export async function logSyncRun(syncType, status, summary, details) {
  try {
    const db = await getDb();
    await db.prepare(`
      INSERT INTO sync_logs (sync_type, status, summary, details)
      VALUES (?, ?, ?, ?)
    `).run(syncType, status, summary, details ? JSON.stringify(details) : null);
  } catch (err) {
    // Logging must never break the actual sync it's describing.
    console.error('[syncLog] Failed to record sync log:', err.message);
  }
}

/**
 * Most recent sync trigger runs, newest first, for display on /admin/link-sync.
 */
export async function getRecentSyncLogs(limit = 20, offset = 0) {
  const db = await getDb();
  const rows = await db.prepare(`
    SELECT id, sync_type, status, summary, details, created_at
    FROM sync_logs
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  return rows.map(r => ({
    ...r,
    details: r.details ? JSON.parse(r.details) : null,
  }));
}

/**
 * Total count of recorded sync runs — for pagination on the full history page.
 */
export async function getSyncLogsCount() {
  const db = await getDb();
  const row = await db.prepare('SELECT COUNT(*) as count FROM sync_logs').get();
  return row?.count || 0;
}
