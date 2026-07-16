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
      web_seo_associate: '/web-associate',
      writers_manager: '/writers-manager',
      seo_manager: '/seo-manager',
      web_seo_manager: '/web-seo-manager',
    };
    redirect(roleRedirects[session.role] || '/login');
  }

  redirect('/login');
}

