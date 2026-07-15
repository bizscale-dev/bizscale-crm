import { verifySession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { logout } from '@/app/login/actions';
import Link from 'next/link';
import Logo from '@/components/Logo';
import ManagerLayoutClient from './ManagerLayoutClient';

const BRAND_COLOR = '#16b293'; // Teal green

export default async function ManagerLayout({ children }) {
  const session = await verifySession();
  if (!session || session.role !== 'manager') {
    redirect('/login');
  }

  return (
    <ManagerLayoutClient>
      {children}
    </ManagerLayoutClient>
  );
}
