import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';

// The image a manager attached when assigning a task, served as a real image. Visible to the person
// who assigned it, to its assignees, and to admin / QA / HR.
export async function GET(_request, { params }) {
  const session = await verifySession();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const { taskId } = await params;
  const id = parseInt(taskId, 10);
  if (!id) return new Response('Not found', { status: 404 });

  const db = await getDb();
  const task = await db.prepare('SELECT created_by, attachment_base64 FROM associate_tasks WHERE id = ?').get(id);
  if (!task?.attachment_base64) return new Response('Not found', { status: 404 });

  let allowed = ['admin', 'qa', 'hr'].includes(session.role) || task.created_by === session.userId;
  if (!allowed) {
    const mine = await db.prepare('SELECT 1 AS x FROM associate_task_assignees WHERE task_id = ? AND user_id = ?').get(id, session.userId);
    allowed = !!mine;
  }
  if (!allowed) return new Response('Forbidden', { status: 403 });

  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is.exec(task.attachment_base64);
  if (!m) return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(m[2], 'base64'), {
    headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=86400' },
  });
}
