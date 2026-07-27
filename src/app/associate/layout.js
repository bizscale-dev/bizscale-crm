'use client';

import RoleLayoutShell from '@/components/RoleLayoutShell';

const navItems = [
  { href: '/associate', label: 'My Dashboard' },
  { href: '/associate/tasks', label: 'My Tasks' },
];

export default function AssociateLayout({ children }) {
  return (
    <RoleLayoutShell navItems={navItems} portalLabel="SEO Associate" headerTitle="SEO Associate Portal">
      {children}
    </RoleLayoutShell>
  );
}
