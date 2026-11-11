import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { CHECK_TARGETS } from '@/lib/taskCheck';

// The picture on a bug an Executive highlighted by hand, served as a real image. Visible to admin, the
// Executive (or manager) whose team the person is on, the person it was reported on, and whoever filed it.
export async function GET(_request, { params }) {
  const session = await verifySession();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const reportId = parseInt(id, 10);
  if (!reportId) return new Response('Not found', { status: 404 });

  const db = await getDb();
  const row = await db.prepare(`
    SELECT r.image_base64, r.user_id, r.created_by, u.role AS user_role
    FROM task_check_reports r JOIN users u ON u.id = r.user_id WHERE r.id = ?
  `).get(reportId);
  if (!row?.image_base64) return new Response('Not found', { status: 404 });

  const cfg = CHECK_TARGETS[session.role];
  const allowed = session.role === 'admin' || row.user_id === session.userId || row.created_by === session.userId
    || (cfg && cfg.targetRole === row.user_role);
  if (!allowed) return new Response('Forbidden', { status: 403 });

  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is.exec(row.image_base64);
  if (!m) return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(m[2], 'base64'), {
    headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=86400' },
  });
}
