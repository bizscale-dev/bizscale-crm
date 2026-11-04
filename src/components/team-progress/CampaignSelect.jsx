'use client';

import { useRouter, usePathname } from 'next/navigation';

// Reloads the page with ?campaign=<id> so a progress page can show any past campaign.
export default function CampaignSelect({ campaigns, selectedId }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <select
      value={selectedId}
      onChange={(e) => router.push(`${pathname}?campaign=${e.target.value}`)}
      style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)', fontSize: '0.85rem', maxWidth: '320px' }}
    >
      {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.status}</option>)}
    </select>
  );
}
