import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { loadSupportTasks } from '@/lib/support';
import SupportTasks from '@/components/support/SupportTasks';

export const revalidate = 0;

export default async function SupportTasksPage() {
  const session = await verifySession();
  const db = await getDb();
  const tasks = await loadSupportTasks(db, { createdBy: session.userId });
  return <SupportTasks tasks={tasks} />;
}
