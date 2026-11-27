import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { loadSupportQueries } from '@/lib/support';
import SupportQueries from '@/components/support/SupportQueries';

export const revalidate = 0;

export default async function SupportQueriesPage() {
  const session = await verifySession();
  const db = await getDb();
  const queries = await loadSupportQueries(db, { recipient: session.userId });
  return <SupportQueries queries={queries} />;
}
