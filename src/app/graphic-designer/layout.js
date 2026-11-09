import { verifySession } from '@/lib/session';
import { redirect } from 'next/navigation';
import PortalLayout from '@/components/taskcheck/PortalLayout';

const ITEMS = [
  {
    "href": "/graphic-designer/tasks",
    "label": "My Tasks",
    "badge": "tasks"
  },
  {
    "href": "/graphic-designer/eod",
    "label": "EOD Report"
  },
  {
    "href": "/graphic-designer/reports",
    "label": "Reports",
    "badge": "reports"
  }
];

export default async function Layout({ children }) {
  const session = await verifySession();
  if (!session || session.role !== 'graphic_designer') redirect('/login');
  return <PortalLayout items={ITEMS} headerTitle="Graphics Designer Portal">{children}</PortalLayout>;
}
