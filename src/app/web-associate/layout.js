'use client';

import { useState, useEffect } from 'react';
import RoleLayoutShell from '@/components/RoleLayoutShell';
import { getUnsubmittedAssociateTaskCount } from './manager-tasks/actions';

export default function WebAssociateLayout({ children }) {
  const [pendingTaskCount, setPendingTaskCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const count = await getUnsubmittedAssociateTaskCount();
      if (!cancelled) setPendingTaskCount(count);
    };
    poll();
    const interval = setInterval(poll, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const navItems = [
    { href: '/web-associate', label: 'My Dashboard' },
    { href: '/web-associate/manager-tasks', label: 'Manager Tasks', badgeCount: pendingTaskCount },
  ];

  return (
    <RoleLayoutShell navItems={navItems} portalLabel="Web SEO Associate" headerTitle="Web SEO Associate Portal">
      {children}
    </RoleLayoutShell>
  );
}
