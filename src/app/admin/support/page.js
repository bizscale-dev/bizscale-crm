import { getDb } from '@/lib/db';
import { loadSupportTasks, loadSupportQueries, getActiveUsersByRole, SUPPORT_MANAGER_ROLES, ROLE_LABELS } from '@/lib/support';
import AdminSupport from '@/components/support/AdminSupport';

export const revalidate = 0;

export default async function AdminSupportPage() {
  const db = await getDb();
  const [tasks, queries, managers, supportPeople] = await Promise.all([
    loadSupportTasks(db),
    loadSupportQueries(db),
    getActiveUsersByRole(db, SUPPORT_MANAGER_ROLES),
    getActiveUsersByRole(db, ['support']),
  ]);
  return <AdminSupport tasks={tasks} queries={queries} managers={managers} supportPeople={supportPeople} roleLabels={ROLE_LABELS} />;
}
