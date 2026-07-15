import { verifySession } from '@/lib/session';
import { redirect } from 'next/navigation';
import WriterLayoutClient from './WriterLayoutClient';

const BRAND_COLOR = '#16b293'; // Teal green

export default async function WriterLayout({ children }) {
  const session = await verifySession();
  if (!session || session.role !== 'writer') {
    redirect('/login');
  }

  return (
    <WriterLayoutClient>
      {children}
    </WriterLayoutClient>
  );
}
