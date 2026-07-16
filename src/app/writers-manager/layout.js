import { verifySession } from '@/lib/session';
import { redirect } from 'next/navigation';
import WritersManagerLayoutClient from './WritersManagerLayoutClient';

export default async function WritersManagerLayout({ children }) {
  const session = await verifySession();
  if (!session || session.role !== 'writers_manager') {
    redirect('/login');
  }

  return (
    <WritersManagerLayoutClient>
      {children}
    </WritersManagerLayoutClient>
  );
}
