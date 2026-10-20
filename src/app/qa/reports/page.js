import { getDb } from '@/lib/db';
import Link from 'next/link';
import Linkify from '../Linkify';
import LinkList from '@/components/LinkList';
import DeleteReportButton from './DeleteReportButton';
import QaManualDetails, { SeverityBadge } from '@/components/QaManualDetails';
import { cardStyle, StatPill } from '../qaStyles';
import { QA_RESOLVE_DAYS, withQaDue } from '@/lib/qaReports';

export const revalidate = 0;

const ROLE_LABELS = {
  web_seo_manager: 'Web SEO Manager',
  seo_manager: 'SEO Manager',
  writers_manager: 'Writers Manager',
};

const STATUS_STYLES = {
  open: { label: 'Open', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
  overdue: { label: 'Overdue', color: 'var(--danger)', bg: 'rgba(239, 68, 68, 0.12)' },
  resolved: { label: 'Resolved', color: 'var(--success)', bg: 'rgba(34, 197, 94, 0.12)' },
};

const toDate = (dateStr) => new Date(dateStr.replace(' ', 'T') + 'Z');

// readOnly is passed by the admin QA page, which shows this same list without
// the QA-only controls (delete, links into the QA portal).
// onlyResolved is passed by the Resolved page (QA portal and admin tab).
export default async function QaReportsPage({ readOnly = false, onlyResolved = false } = {}) {
  const db = await getDb();

  // Every report the QA team has filed (not just the signed-in person's) —
  // QA works as a team, and this is the shared record of what's been flagged.
  const rows = await db.prepare(`
    SELECT q.id, q.source, q.title, q.location, q.issue, q.department, q.severity, q.screenshot_base64, q.client_names, q.report_date, q.web_client_name, q.page_url, q.work_done, q.note, q.status, q.created_at,
      q.resolved_at, q.resolution_note,
      m.id as manager_id, m.name as manager_name, m.role as manager_role,
      f.name as filed_by
    FROM qa_reports q
    JOIN users m ON m.id = q.manager_id
    JOIN users f ON f.id = q.qa_user_id
    ${onlyResolved ? "WHERE q.status = 'resolved'" : ''}
    ORDER BY ${onlyResolved ? 'q.resolved_at DESC' : 'q.created_at DESC'}, q.id DESC
  `).all();

  const reports = withQaDue(rows);
  const isOverdue = (r) => !!r.is_overdue;
  const openCount = reports.filter((r) => r.status === 'open').length;
  const overdueCount = reports.filter(isOverdue).length;
  const resolvedCount = reports.length - openCount;
  const lateCount = reports.filter((r) => r.status === 'resolved' && r.resolved_at > r.due_at).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.35rem' }}>{onlyResolved ? 'Resolved' : 'Reports'}</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          {onlyResolved ? 'Issues the managers have resolved, newest resolution first, with their resolution notes.' : <>EOD entries QA has flagged, with the note explaining what didn&apos;t check out. Each manager
          has {QA_RESOLVE_DAYS} working days (Sat/Sun excluded) to resolve a report. Flag new ones from the EOD page.</>}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {onlyResolved ? (
          <>
            <StatPill label="Resolved" value={resolvedCount} color="var(--success)" />
            <StatPill label="On time" value={resolvedCount - lateCount} color="var(--primary)" />
            <StatPill label="Resolved late" value={lateCount} color="#f59e0b" />
          </>
        ) : (
          <>
            <StatPill label="Total Reports" value={reports.length} color="var(--primary)" />
            <StatPill label="Open" value={openCount} color="#f59e0b" />
            <StatPill label="Overdue" value={overdueCount} color="var(--danger)" />
            <StatPill label="Resolved" value={resolvedCount} color="var(--success)" />
          </>
        )}
      </div>

      {reports.length === 0 ? (
        <div style={cardStyle}>
          <p style={{ color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
            {onlyResolved ? 'No resolved issues yet.' : 'Nothing flagged yet. Use the Report button next to a link on the EOD page.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {reports.map((r) => {
            const status = r.status === 'resolved' ? STATUS_STYLES.resolved : isOverdue(r) ? STATUS_STYLES.overdue : STATUS_STYLES.open;
            return (
              <div key={r.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
                      {readOnly ? (
                        <span style={{ fontWeight: '600' }}>{r.manager_name}</span>
                      ) : (
                        <Link href={`/qa/eod/${r.manager_id}`} style={{ fontWeight: '600', color: 'inherit', textDecoration: 'none' }}>
                          {r.manager_name}
                        </Link>
                      )}
                      <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '1rem', backgroundColor: 'rgba(22, 178, 147, 0.1)', color: 'var(--primary)', fontWeight: '600' }}>
                        {ROLE_LABELS[r.manager_role] || r.manager_role}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {r.source === 'manual'
                        ? `Manual report · ${r.title || r.web_client_name || 'no client'} · filed ${r.report_date}`
                        : r.source === 'manager_task'
                          ? `📋 Task due ${r.report_date}`
                          : `EOD of ${r.report_date} · ${r.web_client_name}`} · resolve by {r.due_at.slice(0, 10)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {r.source === 'manual' && <SeverityBadge severity={r.severity} />}
                    <span style={{ fontSize: '0.72rem', fontWeight: '600', color: status.color, backgroundColor: status.bg, padding: '0.2rem 0.6rem', borderRadius: '1rem', whiteSpace: 'nowrap' }}>
                      {status.label}
                    </span>
                  </div>
                </div>

                <LinkList text={r.page_url} style={{ fontSize: '0.78rem', marginBottom: '0.6rem' }} />
                <LinkList text={r.work_done} style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }} />

                {r.source === 'manual' && <QaManualDetails report={r} />}

                <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderLeft: '3px solid #f59e0b', borderRadius: '0.5rem', fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
                  <Linkify text={r.note} />
                </div>
                {r.status === 'resolved' && (
                  <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', backgroundColor: 'rgba(34, 197, 94, 0.06)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '0.5rem', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--success)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                      Manager&apos;s resolution · {toDate(r.resolved_at).toLocaleString()}
                      {toDate(r.resolved_at) > toDate(r.due_at) ? ' · resolved late' : ''}
                    </div>
                    <Linkify text={r.resolution_note} />
                  </div>
                )}
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.6rem' }}>
                  Flagged by {r.filed_by} · {new Date(r.created_at.replace(' ', 'T') + 'Z').toLocaleString()}
                </div>
                {!readOnly && <DeleteReportButton reportId={r.id} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
