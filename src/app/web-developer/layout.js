'use client';

import { useState, useEffect } from 'react';
import RoleLayoutShell from '@/components/RoleLayoutShell';
// The Web Developer - SEO receives tasks from the Web SEO managers the same way a Web SEO
// associate does, so the task count comes from the same action.
import { getUnsubmittedAssociateTaskCount } from '../web-associate/manager-tasks/actions';

export default function WebDeveloperLayout({ children }) {
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
    { href: '/web-developer/tasks', label: 'My Tasks', badgeCount: pendingTaskCount },
    { href: '/web-developer/eod', label: 'EOD Report' },
  ];

  return (
    <RoleLayoutShell navItems={navItems} portalLabel="Web Developer - SEO" headerTitle="Web Developer - SEO Portal">
      {children}
    </RoleLayoutShell>
  );
}
