import Link from 'next/link';
import { getRecentSyncLogs, getSyncLogsCount } from '@/lib/syncLog';
import { SYNC_TYPE_LABELS, formatLogTime } from '../syncLogDisplay';

export const revalidate = 0;

const PAGE_SIZES = [50, 100];

export default async function SyncHistoryPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const page = Math.max(1, parseInt(resolvedSearchParams?.page, 10) || 1);
  const pageSize = PAGE_SIZES.includes(parseInt(resolvedSearchParams?.pageSize, 10))
    ? parseInt(resolvedSearchParams.pageSize, 10)
    : 50;

  const totalCount = await getSyncLogsCount();
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * pageSize;

  const syncLogs = await getRecentSyncLogs(pageSize, offset);

  const pageLink = (p, ps = pageSize) => `/admin/link-sync/history?page=${p}&pageSize=${ps}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <Link href="/admin/link-sync" style={{ fontSize: '0.875rem', color: 'var(--primary)', textDecoration: 'none' }}>
              ← Back to Sync Completed Links
            </Link>
            <h1 style={{ fontSize: '1.5rem', margin: '0.5rem 0 0 0' }}>All Sync Activity</h1>
            <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>
              {totalCount} total run{totalCount === 1 ? '' : 's'} recorded
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Per page:</span>
            {PAGE_SIZES.map(ps => (
              <Link
                key={ps}
                href={pageLink(1, ps)}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: `1px solid ${ps === pageSize ? 'var(--primary)' : 'var(--border)'}`,
                  backgroundColor: ps === pageSize ? 'rgba(22, 178, 147, 0.1)' : 'transparent',
                  color: ps === pageSize ? 'var(--primary)' : 'var(--foreground)',
                  textDecoration: 'none',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                }}
              >
                {ps}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        {syncLogs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No sync runs recorded yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>Time (PKT)</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Trigger</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Status</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>What Happened</th>
                </tr>
              </thead>
              <tbody>
                {syncLogs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                      {formatLogTime(log.created_at)}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      {SYNC_TYPE_LABELS[log.sync_type] || log.sync_type}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <span
                        style={{
                          padding: '0.15rem 0.5rem',
                          borderRadius: '1rem',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: log.status === 'success' ? '#2e7d32' : '#c62828',
                          backgroundColor: log.status === 'success' ? 'rgba(46, 125, 50, 0.12)' : 'rgba(198, 40, 40, 0.12)',
                        }}
                      >
                        {log.status === 'success' ? 'Success' : 'Error'}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{log.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Page {currentPage} of {totalPages}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <PageLink href={pageLink(currentPage - 1)} disabled={currentPage <= 1}>← Prev</PageLink>
              <PageLink href={pageLink(currentPage + 1)} disabled={currentPage >= totalPages}>Next →</PageLink>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PageLink({ href, disabled, children }) {
  if (disabled) {
    return (
      <span style={{
        padding: '0.4rem 0.85rem', borderRadius: '0.5rem', border: '1px solid var(--border)',
        color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: '600', opacity: 0.5,
      }}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} style={{
      padding: '0.4rem 0.85rem', borderRadius: '0.5rem', border: '1px solid var(--border)',
      color: 'var(--foreground)', textDecoration: 'none', fontSize: '0.8rem', fontWeight: '600',
    }}>
      {children}
    </Link>
  );
}
