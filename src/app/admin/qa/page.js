import Link from 'next/link';
import QaStatsPage from '@/app/qa/stats/page';
import QaClientsStatsPage from '@/app/qa/clients-stats/page';
import QaReportsPage from '@/app/qa/reports/page';

export const revalidate = 0;

const TABS = [
  { key: 'stats', label: 'Stats' },
  { key: 'clients-stats', label: 'Clients Stats' },
  { key: 'reports', label: 'Reports' },
  { key: 'resolved', label: 'Resolved' },
];

// Read-only window into the QA portal: the same Stats, Clients Stats and
// Reports pages QA works from, inside the admin portal.
export default async function AdminQaPage({ searchParams }) {
  const { tab, status } = await searchParams;
  const active = TABS.some((t) => t.key === tab) ? tab : 'stats';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.35rem' }}>QA</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          What the QA team has flagged and how managers are resolving it.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/qa?tab=${t.key}`}
            style={{
              padding: '0.45rem 1.1rem', borderRadius: '2rem', fontSize: '0.85rem', fontWeight: '600', textDecoration: 'none',
              border: `1.5px solid ${active === t.key ? 'var(--primary)' : 'var(--border)'}`,
              backgroundColor: active === t.key ? 'rgba(22, 178, 147, 0.1)' : 'transparent',
              color: active === t.key ? 'var(--primary)' : 'var(--text-muted)',
            }}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {active === 'stats' && <QaStatsPage />}
      {active === 'clients-stats' && <QaClientsStatsPage />}
      {active === 'reports' && <QaReportsPage readOnly status={status} basePath="/admin/qa?tab=reports" />}
      {active === 'resolved' && <QaReportsPage readOnly onlyResolved />}
    </div>
  );
}
