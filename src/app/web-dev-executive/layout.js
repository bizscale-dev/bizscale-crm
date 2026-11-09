import { verifySession } from '@/lib/session';
import { redirect } from 'next/navigation';
import PortalLayout from '@/components/taskcheck/PortalLayout';

const ITEMS = [
  {
    "href": "/web-dev-executive/checks",
    "label": "Task Checks"
  },
  {
    "href": "/web-dev-executive/eod",
    "label": "EOD"
  },
  {
    "href": "/web-dev-executive/reports",
    "label": "Reports",
    "badge": "reports"
  }
];

export default async function Layout({ children }) {
  const session = await verifySession();
  if (!session || session.role !== 'web_developer_executive') redirect('/login');
  return <PortalLayout items={ITEMS} headerTitle="Web Developer Executive Portal">{children}</PortalLayout>;
}
