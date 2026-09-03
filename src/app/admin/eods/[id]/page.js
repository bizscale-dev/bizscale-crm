import { getDb } from '@/lib/db';
import Link from 'next/link';
import EodManagerReports from './EodManagerReports';

export const revalidate = 0;

export default async function AdminEodManagerPage({ params }) {
  const { id } = await params;
  const db = await getDb();
  const managerId = parseInt(id, 10);

  const manager = await db.prepare(
    "SELECT id, name, email FROM users WHERE id = ? AND role IN ('web_seo_manager', 'seo_manager', 'writers_manager')"
  ).get(managerId);

  if (!manager) {
    return (
      <div className="card">
        <p style={{ color: 'var(--danger)', margin: 0 }}>Manager not found.</p>
      </div>
    );
  }

  // Only the web clients that actually appear in this manager's reports — no point
  // offering filter options that can never match anything.
  const webClients = await db.prepare(`
    SELECT DISTINCT e.web_client_id as id, e.web_client_name as label
    FROM eod_report_entries e
    JOIN eod_reports r ON r.id = e.report_id
    WHERE r.user_id = ?
    ORDER BY e.web_client_name
  `).all(managerId);

  const rows = await db.prepare(`
    SELECT r.id as report_id, r.report_date, r.created_at,
      e.id as entry_id, e.web_client_id, e.web_client_name, e.page_url, e.work_done, e.description
    FROM eod_reports r
    JOIN eod_report_entries e ON e.report_id = r.id
    WHERE r.user_id = ?
    ORDER BY r.report_date DESC, e.id ASC
  `).all(managerId);

  const byReport = new Map();
  for (const row of rows) {
    if (!byReport.has(row.report_id)) {
      byReport.set(row.report_id, {
        id: row.report_id,
        report_date: row.report_date,
        created_at: row.created_at,
        entries: [],
      });
    }
    byReport.get(row.report_id).entries.push({
      id: row.entry_id,
      web_client_id: row.web_client_id,
      web_client_name: row.web_client_name,
      page_url: row.page_url,
      work_done: row.work_done,
      description: row.description,
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <Link href="/admin/eods" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.875rem' }}>
          ← Back to EODs
        </Link>
        <h1 style={{ fontSize: '1.5rem', margin: '0.5rem 0 0 0' }}>{manager.name}</h1>
        <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>{manager.email}</p>
      </div>

      <EodManagerReports
        managerId={manager.id}
        webClients={webClients}
        initialReports={[...byReport.values()]}
      />
    </div>
  );
}
