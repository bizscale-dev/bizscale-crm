'use client';

import RoleLayoutShell from '@/components/RoleLayoutShell';

const navItems = [
  { href: '/web-seo-manager', label: 'Web SEO Associates' },
  { href: '/web-seo-manager/eod', label: 'EOD Report' },
];

export default function WebSeoManagerLayoutClient({ children }) {
  return (
    <RoleLayoutShell navItems={navItems} portalLabel="Web SEO Manager" headerTitle="Web SEO Associate Manager Portal">
      {children}
    </RoleLayoutShell>
  );
}
