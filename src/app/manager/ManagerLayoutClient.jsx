'use client';

import RoleLayoutShell from '@/components/RoleLayoutShell';

const navItems = [
  { href: '/manager', label: 'Overview' },
  { href: '/manager/associates', label: 'SEO Associates' },
  { href: '/manager/web-seo-associates', label: 'Web SEO Associates' },
  { href: '/manager/writers', label: 'Writers' },
  { href: '/manager/clients', label: 'Clients' },
];

export default function ManagerLayoutClient({ children }) {
  return (
    <RoleLayoutShell navItems={navItems} portalLabel="Manager" headerTitle="Manager Portal">
      {children}
    </RoleLayoutShell>
  );
}
