'use client';

import dynamic from 'next/dynamic';

// Client-only on purpose: dates are bucketed in the viewer's local timezone,
// so server-rendering this would produce different markup than the browser
// and trigger hydration mismatches.
const QaStatsView = dynamic(() => import('./QaStatsView'), {
  ssr: false,
  loading: () => <p style={{ color: 'var(--text-muted)' }}>Loading stats…</p>,
});

export default function QaStatsClient(props) {
  return <QaStatsView {...props} />;
}
