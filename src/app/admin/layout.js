import { verifySession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { logout } from '@/app/login/actions';
import AdminLayoutClient from './AdminLayoutClient';

export default async function AdminLayout({ children }) {
  const session = await verifySession();
  if (!session || session.role !== 'admin') {
    redirect('/login');
  }

  return (
    <AdminLayoutClient session={session}>
      {children}
    </AdminLayoutClient>
  );
}
