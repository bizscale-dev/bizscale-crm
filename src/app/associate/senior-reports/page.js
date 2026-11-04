import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/session';
import SeoManagerReportsPage from '../../seo-manager/reports/page';

export const revalidate = 0;

// A Senior SEO Associate's Reports page: the QA reports raised on the clients they own, with the
// same fix-and-send-for-review flow as an SEO manager's.
export default async function SeniorReportsPage() {
  const session = await verifySession();
  if (session?.role !== 'senior_seo_associate') redirect('/associate');
  return <SeoManagerReportsPage />;
}
