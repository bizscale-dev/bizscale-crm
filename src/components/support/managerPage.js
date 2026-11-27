import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { loadSupportQueries } from '@/lib/support';
import ManagerSupport from './ManagerSupport';

// Shared by the SEO Manager and Web SEO Manager "Support" pages.
export async function renderManagerSupportPage() {
  const session = await verifySession();
  const db = await getDb();
  const queries = await loadSupportQueries(db, { createdBy: session.userId });

  // Opening the page counts as reading the replies; done after loading so they still show as new now.
  await db.prepare(`
    UPDATE support_query_replies SET seen_at = CURRENT_TIMESTAMP
    WHERE seen_at IS NULL AND query_id IN (SELECT id FROM support_queries WHERE created_by = ?)
  `).run(session.userId);

  return <ManagerSupport queries={queries} />;
}
