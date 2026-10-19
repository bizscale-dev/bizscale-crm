'use client';

import RoleLayoutShell from '@/components/RoleLayoutShell';

const navItems = [
  { href: '/qa/eod', label: 'EOD' },
  { href: '/qa/manager-tasks', label: 'Managers Tasks' },
  { href: '/qa/executives', label: 'Executives' },
  { href: '/qa/reports', label: 'Reports' },
];

export default function QaLayout({ children }) {
  return (
    <RoleLayoutShell navItems={navItems} portalLabel="QA" headerTitle="QA Portal">
      {children}
    </RoleLayoutShell>
  );
}
