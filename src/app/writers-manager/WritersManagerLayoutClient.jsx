'use client';

import { useState, useEffect } from 'react';
import RoleLayoutShell from '@/components/RoleLayoutShell';
import { getUnsubmittedTaskCount } from './tasks/actions';
import { getOpenReportCount } from './reports/actions';

export default function WritersManagerLayoutClient({ children }) {
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [openReportCount, setOpenReportCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const [taskCount, reportCount] = await Promise.all([getUnsubmittedTaskCount(), getOpenReportCount()]);
      if (!cancelled) {
        setPendingTaskCount(taskCount);
        setOpenReportCount(reportCount);
      }
    };
    poll();
    const interval = setInterval(poll, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const navItems = [
    { href: '/writers-manager', label: 'Writers' },
    { href: '/writers-manager/eod', label: 'EOD Report' },
    { href: '/writers-manager/tasks', label: 'Tasks', badgeCount: pendingTaskCount },
    { href: '/writers-manager/associate-tasks', label: 'Associate Tasks' },
    { href: '/writers-manager/reports', label: 'Reports', badgeCount: openReportCount },
  ];

  return (
    <RoleLayoutShell navItems={navItems} portalLabel="Writers Manager" headerTitle="Writers Manager Portal">
      {children}
    </RoleLayoutShell>
  );
}
