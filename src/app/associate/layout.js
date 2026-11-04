import { verifySession } from '@/lib/session';
import AssociateLayoutClient from './AssociateLayoutClient';

export default async function AssociateLayout({ children }) {
  const session = await verifySession();
  return (
    <AssociateLayoutClient isSenior={session?.role === 'senior_seo_associate'}>
      {children}
    </AssociateLayoutClient>
  );
}
