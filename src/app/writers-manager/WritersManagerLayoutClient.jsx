'use client';

import RoleLayoutShell from '@/components/RoleLayoutShell';

const navItems = [
  { href: '/writers-manager', label: 'Writers' },
  { href: '/writers-manager/eod', label: 'EOD Report' },
];

export default function WritersManagerLayoutClient({ children }) {
  return (
    <RoleLayoutShell navItems={navItems} portalLabel="Writers Manager" headerTitle="Writers Manager Portal">
      {children}
    </RoleLayoutShell>
  );
}
