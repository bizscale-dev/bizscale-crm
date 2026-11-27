'use client';

import { useState, useEffect } from 'react';
import RoleLayoutShell from '@/components/RoleLayoutShell';
import { getSupportBadgeCount } from '@/lib/supportActions';

export default function SupportLayoutClient({ children }) {
  const [openQueries, setOpenQueries] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const count = await getSupportBadgeCount();
      if (!cancelled) setOpenQueries(count);
    };
    poll();
    const interval = setInterval(poll, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const navItems = [
    { href: '/support', label: 'Queries', badgeCount: openQueries },
    { href: '/support/tasks', label: 'Tasks to Tech' },
  ];

  return (
    <RoleLayoutShell navItems={navItems} portalLabel="Support" headerTitle="Support Portal">
      {children}
    </RoleLayoutShell>
  );
}
