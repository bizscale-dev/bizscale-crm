import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { loadSupportTasks, getSeoClientNames } from '@/lib/support';
import SupportTasks from '@/components/support/SupportTasks';

export const revalidate = 0;

export default async function SupportTasksPage() {
  const session = await verifySession();
  const db = await getDb();
  const [tasks, clients] = await Promise.all([loadSupportTasks(db, { createdBy: session.userId }), getSeoClientNames(db)]);
  return <SupportTasks tasks={tasks} clients={clients} />;
}
