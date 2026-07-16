import { verifySession } from '@/lib/session';
import { redirect } from 'next/navigation';
import SeoManagerLayoutClient from './SeoManagerLayoutClient';

export default async function SeoManagerLayout({ children }) {
  const session = await verifySession();
  if (!session || session.role !== 'seo_manager') {
    redirect('/login');
  }

  return (
    <SeoManagerLayoutClient>
      {children}
    </SeoManagerLayoutClient>
  );
}
