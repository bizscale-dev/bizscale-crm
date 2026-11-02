'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { selectStyle } from '../hrStyles';

// Switches which campaign a section shows by setting ?<param>=<id> and keeping the other
// section's choice.
export default function CampaignPicker({ param, campaigns, selectedId }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const onChange = (e) => {
    const next = new URLSearchParams(search.toString());
    next.set(param, e.target.value);
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <select value={selectedId} onChange={onChange} style={{ ...selectStyle, maxWidth: '320px' }}>
      {campaigns.map((c) => (
        <option key={c.id} value={c.id}>{c.name} — {c.status}</option>
      ))}
    </select>
  );
}
