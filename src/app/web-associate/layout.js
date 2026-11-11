'use client';

import { useState, useEffect } from 'react';
import RoleLayoutShell from '@/components/RoleLayoutShell';
import { getUnsubmittedAssociateTaskCount } from './manager-tasks/actions';
import { getOpenAssociateReportCount } from '../associate/reports/actions';

export default function WebAssociateLayout({ children }) {
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [reportCount, setReportCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const [count, reports] = await Promise.all([getUnsubmittedAssociateTaskCount(), getOpenAssociateReportCount()]);
      if (!cancelled) { setPendingTaskCount(count); setReportCount(reports); }
    };
    poll();
    const interval = setInterval(poll, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const navItems = [
    { href: '/web-associate', label: 'My Dashboard' },
    { href: '/web-associate/manager-tasks', label: 'Manager Tasks', badgeCount: pendingTaskCount },
    { href: '/web-associate/reports', label: 'Reports', badgeCount: reportCount },
  ];

  return (
    <RoleLayoutShell navItems={navItems} portalLabel="Web SEO Associate" headerTitle="Web SEO Associate Portal">
      {children}
    </RoleLayoutShell>
  );
}
