'use client';

import RoleLayoutShell from '@/components/RoleLayoutShell';

const navItems = [
  { href: '/writer', label: 'My Dashboard' },
  { href: '/writer/tasks', label: 'My Tasks' },
  { href: '/writer/clients', label: 'Clients' },
  { href: '/writer/logs', label: 'My Logs' },
];

export default function WriterLayoutClient({ children }) {
  return (
    <RoleLayoutShell navItems={navItems} portalLabel="Writer" headerTitle="Writer Portal">
      {children}
    </RoleLayoutShell>
  );
}
