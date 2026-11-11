'use client';

import { useState, useEffect } from 'react';
import RoleLayoutShell from '@/components/RoleLayoutShell';
import { getUnsubmittedAssociateTaskCount } from './manager-tasks/actions';
import { getUnsubmittedTaskCount } from '../seo-manager/tasks/actions';
import { getOpenReportCount } from '../seo-manager/reports/actions';
import { getOpenAssociateReportCount } from './reports/actions';

// A Senior SEO Associate gets every associate page plus two extra ones: Tasks (assigned by
// admin, like a manager's) and Reports (QA reports on the clients they own).
export default function AssociateLayoutClient({ children, isSenior = false }) {
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [seniorTaskCount, setSeniorTaskCount] = useState(0);
  const [openReportCount, setOpenReportCount] = useState(0);
  const [ownReportCount, setOwnReportCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const count = await getUnsubmittedAssociateTaskCount();
      const own = await getOpenAssociateReportCount();
      const [tasks, reports] = isSenior
        ? await Promise.all([getUnsubmittedTaskCount(), getOpenReportCount()])
        : [0, 0];
      if (!cancelled) {
        setPendingTaskCount(count);
        setSeniorTaskCount(tasks);
        setOpenReportCount(reports);
        setOwnReportCount(own);
      }
    };
    poll();
    const interval = setInterval(poll, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isSenior]);

  const navItems = [
    { href: '/associate', label: 'My Dashboard' },
    { href: '/associate/tasks', label: 'My Tasks' },
    { href: '/associate/manager-tasks', label: 'Manager Tasks', badgeCount: pendingTaskCount },
    ...(isSenior ? [] : [{ href: '/associate/reports', label: 'Reports', badgeCount: ownReportCount }]),
    ...(isSenior ? [
      { href: '/associate/senior-tasks', label: 'Tasks', badgeCount: seniorTaskCount },
      { href: '/associate/senior-reports', label: 'Reports', badgeCount: openReportCount },
    ] : []),
  ];

  return (
    <RoleLayoutShell navItems={navItems} portalLabel={isSenior ? 'Senior SEO Associate' : 'SEO Associate'} headerTitle={isSenior ? 'Senior SEO Associate Portal' : 'SEO Associate Portal'}>
      {children}
    </RoleLayoutShell>
  );
}
