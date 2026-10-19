import { getDb } from '@/lib/db';
import Link from 'next/link';
import Linkify from '../Linkify';
import { cardStyle, StatPill } from '../qaStyles';

export const revalidate = 0;

const ROLE_LABELS = {
  web_seo_manager: 'Web SEO Manager',
  seo_manager: 'SEO Manager',
  writers_manager: 'Writers Manager',
};

const STATUS_STYLES = {
  open: { label: 'Open', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
};

export default async function QaReportsPage() {
  const db = await getDb();

  // Every report the QA team has filed (not just the signed-in person's) —
  // QA works as a team, and this is the shared record of what's been flagged.
  const reports = await db.prepare(`
    SELECT q.id, q.report_date, q.web_client_name, q.page_url, q.work_done, q.note, q.status, q.created_at,
      m.id as manager_id, m.name as manager_name, m.role as manager_role,
      f.name as filed_by
    FROM qa_reports q
    JOIN users m ON m.id = q.manager_id
    JOIN users f ON f.id = q.qa_user_id
    ORDER BY q.created_at DESC, q.id DESC
  `).all();

  const openCount = reports.filter((r) => r.status === 'open').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.35rem' }}>Reports</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          EOD entries QA has flagged, with the note explaining what didn&apos;t check out. Flag new ones
          from the EOD page.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <StatPill label="Total Reports" value={reports.length} color="var(--primary)" />
        <StatPill label="Open" value={openCount} color="#f59e0b" />
      </div>

      {reports.length === 0 ? (
        <div style={cardStyle}>
          <p style={{ color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
            Nothing flagged yet. Use the Report button next to a link on the EOD page.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {reports.map((r) => {
            const status = STATUS_STYLES[r.status] || STATUS_STYLES.open;
            return (
              <div key={r.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
                      <Link href={`/qa/eod/${r.manager_id}`} style={{ fontWeight: '600', color: 'inherit', textDecoration: 'none' }}>
                        {r.manager_name}
                      </Link>
                      <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '1rem', backgroundColor: 'rgba(22, 178, 147, 0.1)', color: 'var(--primary)', fontWeight: '600' }}>
                        {ROLE_LABELS[r.manager_role] || r.manager_role}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      EOD of {r.report_date} · {r.web_client_name}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.72rem', fontWeight: '600', color: status.color, backgroundColor: status.bg, padding: '0.2rem 0.6rem', borderRadius: '1rem', whiteSpace: 'nowrap' }}>
                    {status.label}
                  </span>
                </div>

                {r.page_url && (
                  <a href={r.page_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: '0.78rem', color: 'var(--primary)', wordBreak: 'break-all', textDecoration: 'none', marginBottom: '0.6rem' }}>
                    {r.page_url}
                  </a>
                )}
                {r.work_done && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', whiteSpace: 'pre-wrap' }}>
                    <Linkify text={r.work_done} />
                  </div>
                )}

                <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderLeft: '3px solid #f59e0b', borderRadius: '0.5rem', fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
                  <Linkify text={r.note} />
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.6rem' }}>
                  Flagged by {r.filed_by} · {new Date(r.created_at.replace(' ', 'T') + 'Z').toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
