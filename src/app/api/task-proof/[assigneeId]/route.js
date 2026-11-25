import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { CHECK_TARGETS } from '@/lib/taskCheck';
import { imageResponse, parseImages } from '@/lib/multiImages';

// One submitted task's proof image, served as a real image (instead of inlining base64 into the
// page). Visible to admin, to the Executive whose team the submitter is on, to the submitter, and
// to whoever assigned the task.
export async function GET(request, { params }) {
  const session = await verifySession();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const { assigneeId } = await params;
  const id = parseInt(assigneeId, 10);
  if (!id) return new Response('Not found', { status: 404 });

  const db = await getDb();
  const row = await db.prepare(`
    SELECT a.proof_image_base64, a.extra_proof_images, a.user_id, t.created_by, u.role AS user_role
    FROM associate_task_assignees a
    JOIN associate_tasks t ON t.id = a.task_id
    JOIN users u ON u.id = a.user_id
    WHERE a.id = ?
  `).get(id);
  if (!row?.proof_image_base64) return new Response('Not found', { status: 404 });

  const cfg = CHECK_TARGETS[session.role];
  const allowed = ['admin', 'qa', 'hr'].includes(session.role) || row.user_id === session.userId || row.created_by === session.userId
    || (cfg && cfg.targetRole === row.user_role);
  if (!allowed) return new Response('Forbidden', { status: 403 });

  // ?i=N picks an extra picture (1 = the second one); no ?i= is the first picture.
  const i = parseInt(new URL(request.url).searchParams.get('i') || '0', 10) || 0;
  return imageResponse(i > 0 ? parseImages(row.extra_proof_images)[i - 1] : row.proof_image_base64);
}
