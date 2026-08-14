'use client';

import RoleLayoutShell from '@/components/RoleLayoutShell';
import AdminHeaderCalendar from './AdminHeaderCalendar';

const navItems = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/campaign', label: 'Campaign' },
  { href: '/admin/clients', label: 'Clients' },
  { href: '/admin/web-clients', label: 'Web Clients' },
  { href: '/admin/funnel', label: 'Funnel' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/tasks', label: 'Tasks' },
  { href: '/admin/link-sync', label: 'Sync Completed Links' },
  { href: '/admin/seo-associates', label: 'SEO Associates' },
  { href: '/admin/web-seo-associates', label: 'Web SEO Associates' },
  { href: '/admin/writers', label: 'Writers' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/eods', label: 'EODs' },
  { href: '/admin/settings', label: 'Settings' },
];

export default function AdminLayoutClient({ children }) {
  return (
    <RoleLayoutShell
      navItems={navItems}
      portalLabel="Admin Portal"
      headerTitle="Admin Dashboard"
      headerExtra={<AdminHeaderCalendar />}
    >
      {children}
    </RoleLayoutShell>
  );
}
