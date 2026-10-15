'use client';

import RoleLayoutShell from '@/components/RoleLayoutShell';

const navItems = [
  { href: '/hr/associate-tasks', label: 'Associates Tasks' },
  { href: '/hr/manager-tasks', label: 'Managers Tasks' },
  { href: '/hr/eod', label: 'EOD' },
];

export default function HrLayout({ children }) {
  return (
    <RoleLayoutShell navItems={navItems} portalLabel="HR" headerTitle="HR Portal">
      {children}
    </RoleLayoutShell>
  );
}
