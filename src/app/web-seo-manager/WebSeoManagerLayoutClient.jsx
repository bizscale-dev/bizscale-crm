'use client';

import { useState, useEffect } from 'react';
import RoleLayoutShell from '@/components/RoleLayoutShell';
import { getUnsubmittedTaskCount } from './tasks/actions';
import { getOpenReportCount } from './reports/actions';
import { getTaskCheckBadgeCount } from '@/lib/taskCheckActions';

export default function WebSeoManagerLayoutClient({ children }) {
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [openReportCount, setOpenReportCount] = useState(0);
  const [devReportCount, setDevReportCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const [taskCount, reportCount, devCount] = await Promise.all([getUnsubmittedTaskCount(), getOpenReportCount(), getTaskCheckBadgeCount()]);
      if (!cancelled) {
        setPendingTaskCount(taskCount);
        setOpenReportCount(reportCount);
        setDevReportCount(devCount);
      }
    };
    poll();
    const interval = setInterval(poll, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const navItems = [
    { href: '/web-seo-manager', label: 'Web SEO Associates' },
    { href: '/web-seo-manager/eod', label: 'EOD Report' },
    { href: '/web-seo-manager/tasks', label: 'Tasks', badgeCount: pendingTaskCount },
    { href: '/web-seo-manager/associate-tasks', label: 'Associate Tasks' },
    { href: '/web-seo-manager/reports', label: 'Reports', badgeCount: openReportCount },
    { href: '/web-seo-manager/developer-checks', label: 'Developer Checks' },
    { href: '/web-seo-manager/developer-reports', label: 'Developer Reports', badgeCount: devReportCount },
  ];

  return (
    <RoleLayoutShell navItems={navItems} portalLabel="Web SEO Manager" headerTitle="Web SEO Associate Manager Portal">
      {children}
    </RoleLayoutShell>
  );
}
