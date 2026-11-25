import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { CHECK_TARGETS } from '@/lib/taskCheck';
import { imageResponse, parseImages } from '@/lib/multiImages';

// A picture attached to the fix of a QA report (?i=0 is the first). Visible to admin, QA, the manager the
// report is on, whoever submitted the fix, and an Executive whose team that person is on.
export async function GET(request, { params }) {
  const session = await verifySession();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const reportId = parseInt(id, 10);
  if (!reportId) return new Response('Not found', { status: 404 });

  const db = await getDb();
  const row = await db.prepare(`
    SELECT q.fix_images, q.manager_id, q.resolved_by, u.role AS owner_role
    FROM qa_reports q LEFT JOIN users u ON u.id = q.manager_id WHERE q.id = ?
  `).get(reportId);
  if (!row?.fix_images) return new Response('Not found', { status: 404 });

  const cfg = CHECK_TARGETS[session.role];
  const allowed = ['admin', 'qa'].includes(session.role) || row.manager_id === session.userId || row.resolved_by === session.userId
    || (cfg && cfg.targetRole === row.owner_role);
  if (!allowed) return new Response('Forbidden', { status: 403 });

  const i = parseInt(new URL(request.url).searchParams.get('i') || '0', 10) || 0;
  return imageResponse(parseImages(row.fix_images)[i]);
}
