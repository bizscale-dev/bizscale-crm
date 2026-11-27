import { verifySession } from '@/lib/session';
import { redirect } from 'next/navigation';
import SupportLayoutClient from './SupportLayoutClient';

export default async function SupportLayout({ children }) {
  const session = await verifySession();
  if (!session || session.role !== 'support') {
    redirect('/login');
  }

  return (
    <SupportLayoutClient>
      {children}
    </SupportLayoutClient>
  );
}
