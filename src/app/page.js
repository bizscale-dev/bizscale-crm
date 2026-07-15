import { verifySession } from '@/lib/session';
import { redirect } from 'next/navigation';

export default async function Home() {
  const session = await verifySession();

  if (session?.role) {
    const roleRedirects = {
      admin: '/admin',
      seo_associate: '/associate',
      writer: '/writer',
      manager: '/manager',
    };
    redirect(roleRedirects[session.role] || '/login');
  }

  redirect('/login');
}

