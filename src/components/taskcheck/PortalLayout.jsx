'use client';

import { useEffect, useState } from 'react';
import RoleLayoutShell from '@/components/RoleLayoutShell';
import { getTaskCheckBadgeCount } from '@/lib/taskCheckActions';
import { getUnsubmittedAssociateTaskCount } from '@/app/web-associate/manager-tasks/actions';
import { getUnsubmittedTaskCount } from '@/app/web-seo-manager/tasks/actions';

// Sidebar for the Web Developer / Graphics Designer portals and their Executives. Each item may ask
// for a badge: 'tasks' = tasks still to submit, 'reports' = reports waiting on this person.
export default function PortalLayout({ items, headerTitle, children }) {
  const [counts, setCounts] = useState({ tasks: 0, reports: 0, mytasks: 0 });
  const wantsTasks = items.some((i) => i.badge === 'tasks');
  const wantsReports = items.some((i) => i.badge === 'reports');
  const wantsMy = items.some((i) => i.badge === 'mytasks');

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const [tasks, reports, mytasks] = await Promise.all([
        wantsTasks ? getUnsubmittedAssociateTaskCount() : 0,
        wantsReports ? getTaskCheckBadgeCount() : 0,
        wantsMy ? getUnsubmittedTaskCount() : 0,
      ]);
      if (!cancelled) setCounts({ tasks, reports, mytasks });
    };
    poll();
    const interval = setInterval(poll, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [wantsTasks, wantsReports, wantsMy]);

  const navItems = items.map((i) => ({ href: i.href, label: i.label, ...(i.badge ? { badgeCount: counts[i.badge] } : {}) }));
  return (
    <RoleLayoutShell navItems={navItems} headerTitle={headerTitle}>
      {children}
    </RoleLayoutShell>
  );
}
