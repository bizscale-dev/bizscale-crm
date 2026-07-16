import { verifySession } from '@/lib/session';
import { redirect } from 'next/navigation';
import WebSeoManagerLayoutClient from './WebSeoManagerLayoutClient';

export default async function WebSeoManagerLayout({ children }) {
  const session = await verifySession();
  if (!session || session.role !== 'web_seo_manager') {
    redirect('/login');
  }

  return (
    <WebSeoManagerLayoutClient>
      {children}
    </WebSeoManagerLayoutClient>
  );
}
