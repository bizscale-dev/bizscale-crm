import { getDb } from '@/lib/db';
import Link from 'next/link';
import QaEodReports from './QaEodReports';
import { fetchManagerEodReports, EOD_MANAGER_ROLES } from '@/lib/qaEod';

export const revalidate = 0;

export default async function QaEodManagerPage({ params }) {
  const { id } = await params;
  const db = await getDb();
  const managerId = parseInt(id, 10);

  const placeholders = EOD_MANAGER_ROLES.map(() => '?').join(',');
  const manager = await db.prepare(
    `SELECT id, name, email FROM users WHERE id = ? AND role IN (${placeholders})`
  ).get(managerId, ...EOD_MANAGER_ROLES);

  if (!manager) {
    return (
      <div className="card">
        <p style={{ color: 'var(--danger)', margin: 0 }}>Manager not found.</p>
      </div>
    );
  }

  // Only the websites that actually appear in this manager's reports — no
  // point offering filter options that can never match anything.
  const webClients = await db.prepare(`
    SELECT DISTINCT e.web_client_id as id, e.web_client_name as label
    FROM eod_report_entries e
    JOIN eod_reports r ON r.id = e.report_id
    WHERE r.user_id = ?
    ORDER BY e.web_client_name
  `).all(managerId);

  const { reports, reportCounts } = await fetchManagerEodReports(db, managerId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <Link href="/qa/eod" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.875rem' }}>
          ← Back to EODs
        </Link>
        <h1 style={{ fontSize: '1.5rem', margin: '0.5rem 0 0 0' }}>{manager.name}</h1>
        <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>{manager.email}</p>
      </div>

      <QaEodReports
        managerId={manager.id}
        webClients={webClients}
        initialReports={reports}
        initialReportCounts={reportCounts}
      />
    </div>
  );
}
