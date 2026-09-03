'use client';

import RoleLayoutShell from '@/components/RoleLayoutShell';

const navItems = [
  { href: '/seo-manager', label: 'SEO Associates' },
  { href: '/seo-manager/eod', label: 'EOD Report' },
];

export default function SeoManagerLayoutClient({ children }) {
  return (
    <RoleLayoutShell navItems={navItems} portalLabel="SEO Manager" headerTitle="SEO Associate Manager Portal">
      {children}
    </RoleLayoutShell>
  );
}
