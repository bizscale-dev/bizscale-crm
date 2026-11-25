import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { CHECK_TARGETS } from '@/lib/taskCheck';
import { imageResponse, parseImages } from '@/lib/multiImages';

// A picture the reported person attached when they marked a report fixed (?i=0 is the first). Visible to
// admin, the Executive (or manager) whose team the person is on, the person, and whoever filed the report.
export async function GET(request, { params }) {
  const session = await verifySession();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const reportId = parseInt(id, 10);
  if (!reportId) return new Response('Not found', { status: 404 });

  const db = await getDb();
  const row = await db.prepare(`
    SELECT r.resolution_images, r.user_id, r.created_by, u.role AS user_role
    FROM task_check_reports r JOIN users u ON u.id = r.user_id WHERE r.id = ?
  `).get(reportId);
  if (!row?.resolution_images) return new Response('Not found', { status: 404 });

  const cfg = CHECK_TARGETS[session.role];
  const allowed = ['admin', 'qa'].includes(session.role) || row.user_id === session.userId || row.created_by === session.userId
    || (cfg && cfg.targetRole === row.user_role);
  if (!allowed) return new Response('Forbidden', { status: 403 });

  const i = parseInt(new URL(request.url).searchParams.get('i') || '0', 10) || 0;
  return imageResponse(parseImages(row.resolution_images)[i]);
}
