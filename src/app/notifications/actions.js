'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { syncQaFollowUps } from '@/lib/qaReports';

// Shared across every portal (admin, all 3 managers, all 3 associates) — a
// deliberate exception to this codebase's usual per-portal actions.js
// duplication: there is no role-specific logic here, every function scopes
// by `user_id = session.userId` alone, so one file serves everyone.

export async function getNotifications() {
  const session = await verifySession();
  if (!session) return [];
  const db = await getDb();
  if (session.role === 'qa') await syncQaFollowUps(db);
  return db.prepare(`
    SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30
  `).all(session.userId);
}

export async function getUnreadNotificationCount() {
  const session = await verifySession();
  if (!session) return 0;
  const db = await getDb();
  const row = await db.prepare(`
    SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read_at IS NULL
  `).get(session.userId);
  return row?.c || 0;
}

// Rows the login/load popup hasn't shown yet — fetched once on portal mount.
export async function getUndismissedDialogNotifications() {
  const session = await verifySession();
  if (!session) return [];
  const db = await getDb();
  if (session.role === 'qa') await syncQaFollowUps(db);
  return db.prepare(`
    SELECT * FROM notifications WHERE user_id = ? AND dialog_shown_at IS NULL ORDER BY created_at ASC
  `).all(session.userId);
}

export async function markNotificationsDialogShown(ids) {
  const session = await verifySession();
  if (!session) return { error: 'Not authorized' };
  const cleanIds = (ids || []).map((id) => parseInt(id, 10)).filter((n) => !Number.isNaN(n));
  if (cleanIds.length === 0) return { success: true };

  const db = await getDb();
  const placeholders = cleanIds.map(() => '?').join(',');
  await db.prepare(`
    UPDATE notifications SET dialog_shown_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND id IN (${placeholders})
  `).run(session.userId, ...cleanIds);
  return { success: true };
}

export async function markNotificationRead(id) {
  const session = await verifySession();
  if (!session) return { error: 'Not authorized' };
  const cleanId = parseInt(id, 10);
  if (!cleanId) return { error: 'Invalid notification' };

  const db = await getDb();
  await db.prepare(`
    UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?
  `).run(cleanId, session.userId);
  return { success: true };
}

export async function markAllNotificationsRead() {
  const session = await verifySession();
  if (!session) return { error: 'Not authorized' };

  const db = await getDb();
  await db.prepare(`
    UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL
  `).run(session.userId);
  return { success: true };
}
