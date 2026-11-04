import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/session';
import SeoManagerTasksPage from '../../seo-manager/tasks/page';

export const revalidate = 0;

// A Senior SEO Associate's extra Tasks page: the tasks admin assigns them (including the
// onboarding checklists for the clients they own), same page and submit flow as an SEO manager's.
export default async function SeniorTasksPage() {
  const session = await verifySession();
  if (session?.role !== 'senior_seo_associate') redirect('/associate');
  return <SeoManagerTasksPage />;
}
