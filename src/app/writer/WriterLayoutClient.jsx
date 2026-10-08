'use client';

import { useState, useEffect } from 'react';
import RoleLayoutShell from '@/components/RoleLayoutShell';
import { getUnsubmittedAssociateTaskCount } from './manager-tasks/actions';

export default function WriterLayoutClient({ children }) {
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
    { href: '/writer', label: 'My Dashboard' },
    { href: '/writer/tasks', label: 'My Tasks' },
    { href: '/writer/manager-tasks', label: 'Manager Tasks', badgeCount: pendingTaskCount },
  ];

  return (
    <RoleLayoutShell navItems={navItems} portalLabel="Writer" headerTitle="Writer Portal">
      {children}
    </RoleLayoutShell>
  );
}
