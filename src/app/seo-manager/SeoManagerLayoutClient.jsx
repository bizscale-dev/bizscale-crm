'use client';

import { useState, useEffect } from 'react';
import RoleLayoutShell from '@/components/RoleLayoutShell';
import { getUnsubmittedTaskCount } from './tasks/actions';
import { getOpenReportCount } from './reports/actions';

export default function SeoManagerLayoutClient({ children }) {
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
    { href: '/seo-manager', label: 'SEO Associates' },
    { href: '/seo-manager/eod', label: 'EOD Report' },
    { href: '/seo-manager/tasks', label: 'Tasks', badgeCount: pendingTaskCount },
    { href: '/seo-manager/associate-tasks', label: 'Associate Tasks' },
    { href: '/seo-manager/reports', label: 'Reports', badgeCount: openReportCount },
  ];

  return (
    <RoleLayoutShell navItems={navItems} portalLabel="SEO Manager" headerTitle="SEO Associate Manager Portal">
      {children}
    </RoleLayoutShell>
  );
}
