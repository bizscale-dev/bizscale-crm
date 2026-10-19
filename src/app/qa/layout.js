'use client';

import { useEffect, useState } from 'react';
import RoleLayoutShell from '@/components/RoleLayoutShell';
import { getDueFollowUpCount } from './follow-ups/actions';

export default function QaLayout({ children }) {
  const [followUpCount, setFollowUpCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const count = await getDueFollowUpCount();
      if (!cancelled) setFollowUpCount(count);
    };
    poll();
    const interval = setInterval(poll, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const navItems = [
    { href: '/qa/stats', label: 'Stats' },
    { href: '/qa/clients-stats', label: 'Clients Stats' },
    { href: '/qa/eod', label: 'EOD' },
    { href: '/qa/manager-tasks', label: 'Managers Tasks' },
    { href: '/qa/executives', label: 'Executives' },
    { href: '/qa/reports', label: 'Reports' },
    { href: '/qa/follow-ups', label: 'Follow-ups', badgeCount: followUpCount },
  ];

  return (
    <RoleLayoutShell navItems={navItems} portalLabel="QA" headerTitle="QA Portal">
      {children}
    </RoleLayoutShell>
  );
}
