import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';

// Serves one QA report's screenshot as a real image. The report pages used to inline every
// screenshot (base64, ~7 MB across all reports) into the page itself, which made them slow to
// load; now the pages only say "has a screenshot" and the browser fetches the image lazily from
// here. QA and admin can see any report's screenshot; a manager only the ones filed against them.
export async function GET(_request, { params }) {
  const session = await verifySession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const reportId = parseInt(id, 10);
  if (!reportId) return new Response('Not found', { status: 404 });

  const db = await getDb();
  const row = await db.prepare('SELECT manager_id, screenshot_base64 FROM qa_reports WHERE id = ?').get(reportId);
  if (!row?.screenshot_base64) return new Response('Not found', { status: 404 });

  const seesAll = session.role === 'qa' || session.role === 'admin';
  if (!seesAll && row.manager_id !== session.userId) return new Response('Forbidden', { status: 403 });

  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is.exec(row.screenshot_base64);
  if (!m) return new Response('Not found', { status: 404 });

  return new Response(Buffer.from(m[2], 'base64'), {
    headers: {
      'Content-Type': m[1],
      // Screenshots never change once filed; keep them in the viewer's browser only.
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
