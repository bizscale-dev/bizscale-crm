'use client';

import { useState, useEffect } from 'react';
import RoleLayoutShell from '@/components/RoleLayoutShell';
import { getUnsubmittedTaskCount } from './tasks/actions';

export default function SeoManagerLayoutClient({ children }) {
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
    { href: '/seo-manager', label: 'SEO Associates' },
    { href: '/seo-manager/eod', label: 'EOD Report' },
    { href: '/seo-manager/tasks', label: 'Tasks', badgeCount: pendingTaskCount },
  ];

  return (
    <RoleLayoutShell navItems={navItems} portalLabel="SEO Manager" headerTitle="SEO Associate Manager Portal">
      {children}
    </RoleLayoutShell>
  );
}
