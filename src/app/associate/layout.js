'use client';

import { useState, useEffect } from 'react';
import RoleLayoutShell from '@/components/RoleLayoutShell';
import { getUnsubmittedAssociateTaskCount } from './manager-tasks/actions';

export default function AssociateLayout({ children }) {
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
    { href: '/associate', label: 'My Dashboard' },
    { href: '/associate/tasks', label: 'My Tasks' },
    { href: '/associate/manager-tasks', label: 'Manager Tasks', badgeCount: pendingTaskCount },
  ];

  return (
    <RoleLayoutShell navItems={navItems} portalLabel="SEO Associate" headerTitle="SEO Associate Portal">
      {children}
    </RoleLayoutShell>
  );
}
