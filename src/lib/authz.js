// Permission checks for server actions and API routes. Server Functions and /api routes can be called
// directly (not only from our pages, and /api is not covered by proxy.js), so each one checks for itself.
import { verifySession } from '@/lib/session';
import { getDb } from '@/lib/db';

// The signed-in user if they are active and hold one of `roles`, checked in the database so a
// deactivated or demoted account stops working even while its login cookie is still valid. Else null.
export async function getUserWithRole(roles) {
  const session = await verifySession();
  if (!session || !roles.includes(session.role)) return null;
  const db = await getDb();
  const user = await db.prepare('SELECT id, role FROM users WHERE id = ? AND is_active = 1').get(session.userId);
  return user && roles.includes(user.role) ? session : null;
}

// For admin-only server actions: first line of the action.
export async function assertAdmin() {
  if (!(await getUserWithRole(['admin']))) throw new Error('Not authorized');
}

// The scheduler (and the app calling its own sync endpoints) identifies itself with CRON_SECRET.
function isCronRequest(request) {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get('authorization') === `Bearer ${secret}`;
}

export function cronHeaders() {
  return process.env.CRON_SECRET ? { Authorization: `Bearer ${process.env.CRON_SECRET}` } : {};
}

const refused = () => Response.json({ error: 'Not authorized' }, { status: 401 });

// For API routes. Each returns a 401 response to send back, or null when the caller may continue.
export async function refuseUnlessRole(roles) {
  return (await getUserWithRole(roles)) ? null : refused();
}

export async function refuseUnlessAdminOrCron(request) {
  return isCronRequest(request) ? null : refuseUnlessRole(['admin']);
}
