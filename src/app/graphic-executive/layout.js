import { verifySession } from '@/lib/session';
import { redirect } from 'next/navigation';
import PortalLayout from '@/components/taskcheck/PortalLayout';

const ITEMS = [
  {
    "href": "/graphic-executive/my-tasks",
    "label": "My Tasks",
    "badge": "mytasks"
  },
  {
    "href": "/graphic-executive/checks",
    "label": "Task Checks"
  },
  {
    "href": "/graphic-executive/tasks",
    "label": "Assign Tasks"
  },
  {
    "href": "/graphic-executive/eod",
    "label": "EOD"
  },
  {
    "href": "/graphic-executive/reports",
    "label": "Reports",
    "badge": "reports"
  }
];

export default async function Layout({ children }) {
  const session = await verifySession();
  if (!session || session.role !== 'graphic_designer_executive') redirect('/login');
  return <PortalLayout items={ITEMS} headerTitle="Graphic Designer Executive Portal">{children}</PortalLayout>;
}
