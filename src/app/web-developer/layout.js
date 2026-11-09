import { verifySession } from '@/lib/session';
import { redirect } from 'next/navigation';
import PortalLayout from '@/components/taskcheck/PortalLayout';

const ITEMS = [
  {
    "href": "/web-developer/tasks",
    "label": "My Tasks",
    "badge": "tasks"
  },
  {
    "href": "/web-developer/eod",
    "label": "EOD Report"
  },
  {
    "href": "/web-developer/reports",
    "label": "Reports",
    "badge": "reports"
  }
];

export default async function Layout({ children }) {
  const session = await verifySession();
  if (!session || session.role !== 'web_developer_seo') redirect('/login');
  return <PortalLayout items={ITEMS} headerTitle="Web Developer - SEO Portal">{children}</PortalLayout>;
}
