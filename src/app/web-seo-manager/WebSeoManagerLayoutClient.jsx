'use client';

import { useState, useEffect } from 'react';
import RoleLayoutShell from '@/components/RoleLayoutShell';
import { getUnsubmittedTaskCount } from './tasks/actions';

export default function WebSeoManagerLayoutClient({ children }) {
  const [pendingTaskCount, setPendingTaskCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const count = await getUnsubmittedTaskCount();
      if (!cancelled) setPendingTaskCount(count);
    };
    poll();
    const interval = setInterval(poll, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const navItems = [
    { href: '/web-seo-manager', label: 'Web SEO Associates' },
    { href: '/web-seo-manager/eod', label: 'EOD Report' },
    { href: '/web-seo-manager/tasks', label: 'Tasks', badgeCount: pendingTaskCount },
  ];

  return (
    <RoleLayoutShell navItems={navItems} portalLabel="Web SEO Manager" headerTitle="Web SEO Associate Manager Portal">
      {children}
    </RoleLayoutShell>
  );
}
