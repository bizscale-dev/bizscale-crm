import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';

// One manager's submitted proof image (admin -> manager tasks), served as a real image so the big
// all-managers pages don't have to inline every base64 picture. Visible to admin, QA, HR, the
// manager who submitted it and whoever assigned the task.
export async function GET(_request, { params }) {
  const session = await verifySession();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const { assigneeId } = await params;
  const id = parseInt(assigneeId, 10);
  if (!id) return new Response('Not found', { status: 404 });

  const db = await getDb();
  const row = await db.prepare(`
    SELECT a.proof_image_base64, a.user_id, t.created_by
    FROM manager_task_assignees a JOIN manager_tasks t ON t.id = a.task_id
    WHERE a.id = ?
  `).get(id);
  if (!row?.proof_image_base64) return new Response('Not found', { status: 404 });

  const allowed = ['admin', 'qa', 'hr'].includes(session.role) || row.user_id === session.userId || row.created_by === session.userId;
  if (!allowed) return new Response('Forbidden', { status: 403 });

  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is.exec(row.proof_image_base64);
  if (!m) return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(m[2], 'base64'), {
    headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=86400' },
  });
}
