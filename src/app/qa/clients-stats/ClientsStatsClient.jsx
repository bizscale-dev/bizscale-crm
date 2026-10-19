'use client';

import dynamic from 'next/dynamic';

// Client-only for the same reason as the Stats page: local-timezone date
// bucketing would otherwise cause server/browser hydration mismatches.
const ClientsStatsView = dynamic(() => import('./ClientsStatsView'), {
  ssr: false,
  loading: () => <p style={{ color: 'var(--text-muted)' }}>Loading client stats…</p>,
});

export default function ClientsStatsClient(props) {
  return <ClientsStatsView {...props} />;
}
