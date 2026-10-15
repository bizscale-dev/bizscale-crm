import { redirect } from 'next/navigation';

// No dashboard concept for HR — land straight on the first of the 3 views.
export default function HrRootPage() {
  redirect('/hr/associate-tasks');
}
