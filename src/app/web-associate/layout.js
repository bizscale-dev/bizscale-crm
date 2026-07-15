'use client';

import RoleLayoutShell from '@/components/RoleLayoutShell';

const navItems = [
  { href: '/web-associate', label: 'My Dashboard' },
];

export default function WebAssociateLayout({ children }) {
  return (
    <RoleLayoutShell navItems={navItems} portalLabel="Web SEO Associate" headerTitle="Web SEO Associate Portal">
      {children}
    </RoleLayoutShell>
  );
}
