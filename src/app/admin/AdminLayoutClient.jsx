'use client';

import { useState, useEffect } from 'react';
import RoleLayoutShell from '@/components/RoleLayoutShell';
import { getSupportBadgeCount } from '@/lib/supportActions';
import AdminHeaderCalendar from './AdminHeaderCalendar';

const navItems = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/campaign', label: 'Campaign' },
  { href: '/admin/clients', label: 'Clients' },
  { href: '/admin/web-clients', label: 'Web Clients' },
  { href: '/admin/funnel', label: 'Funnel' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/tasks', label: 'Tasks' },
  { href: '/admin/manager-tasks', label: 'Manager Tasks' },
  { href: '/admin/link-sync', label: 'Sync Completed Links' },
  { href: '/admin/seo-associates', label: 'SEO Associates' },
  { href: '/admin/web-seo-associates', label: 'Web SEO Associates' },
  { href: '/admin/writers', label: 'Writers' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/eods', label: 'EODs' },
  { href: '/admin/qa', label: 'QA' },
  { href: '/admin/support', label: 'Support' },
  { href: '/admin/settings', label: 'Settings' },
];

export default function AdminLayoutClient({ children }) {
  const [supportWaiting, setSupportWaiting] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const count = await getSupportBadgeCount();
      if (!cancelled) setSupportWaiting(count);
    };
    poll();
    const interval = setInterval(poll, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const items = navItems.map((item) => (item.href === '/admin/support' ? { ...item, badgeCount: supportWaiting } : item));

  return (
    <RoleLayoutShell
      navItems={items}
      portalLabel="Admin Portal"
      headerTitle="Admin Dashboard"
      headerExtra={<AdminHeaderCalendar />}
    >
      {children}
    </RoleLayoutShell>
  );
}
