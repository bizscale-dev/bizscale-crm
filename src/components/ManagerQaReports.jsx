'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import QaManualDetails, { SeverityBadge } from '@/components/QaManualDetails';

const BRAND_COLOR = 'var(--primary)';
const DAY_MS = 24 * 60 * 60 * 1000;

const cardStyle = {
  backgroundColor: 'var(--card-bg)',
  border: '1px solid var(--border)',
  borderRadius: '0.75rem',
  padding: '1.5rem',
};

// Turns free text into clickable links (QA notes and EOD work text often
// contain pasted URLs the manager needs to open).
const URL_PATTERN = /((?:https?:\/\/|www\.)[^\s<>"]+)/g;
function Linkify({ text }) {
  if (!text) return null;
  return String(text).split(URL_PATTERN).map((part, i) => {
    if (i % 2 === 0) return part;
    const [, url, trailing] = part.match(/^(.*?)([.,;:!?)\]]*)$/);
    return (
      <span key={i}>
        <a href={url.startsWith('www.') ? `https://${url}` : url} target="_blank" rel="noopener noreferrer" style={{ color: BRAND_COLOR, wordBreak: 'break-all' }}>{url}</a>
        {trailing}
      </span>
    );
  });
}

function parseUtc(dateStr) {
  return new Date(dateStr.replace(' ', 'T') + 'Z');
}

// Deadline = created_at + 5 days (computed server-side as due_at). Returns
// the label/colour for an open report: green with time to spare, amber in
// the last 2 days, red once overdue.
function deadlineInfo(dueAt) {
  const msLeft = parseUtc(dueAt).getTime() - Date.now();
  if (msLeft <= 0) {
    const daysLate = Math.max(1, Math.ceil(-msLeft / DAY_MS));
    return { overdue: true, label: `Overdue by ${daysLate} day${daysLate === 1 ? '' : 's'}`, color: 'var(--danger)', bg: 'rgba(239, 68, 68, 0.12)' };
  }
  const daysLeft = Math.ceil(msLeft / DAY_MS);
  const label = msLeft < DAY_MS
    ? `${Math.max(1, Math.ceil(msLeft / (60 * 60 * 1000)))}h left`
    : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
  const urgent = daysLeft <= 2;
  return { overdue: false, label, color: urgent ? '#f59e0b' : 'var(--success)', bg: urgent ? 'rgba(245, 158, 11, 0.12)' : 'rgba(34, 197, 94, 0.12)' };
}

function StatPill({ label, value, color }) {
  return (
    <div style={{ padding: '1rem 1.25rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '0.6rem', flex: '1', minWidth: '140px' }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: '700', color }}>{value}</div>
    </div>
  );
}

function ReportCard({ report, resolveAction }) {
  const router = useRouter();
  const isOpen = report.status === 'open';
  const isTask = report.source === 'manager_task';
  const isManual = report.source === 'manual';
  const deadline = isOpen ? deadlineInfo(report.due_at) : null;
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const result = await resolveAction(report.id, note);
    setSubmitting(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setResolving(false);
    router.refresh();
  };

  const resolvedLate = !isOpen && report.resolved_at && parseUtc(report.resolved_at) > parseUtc(report.due_at);

  return (
    <div style={{ ...cardStyle, borderColor: isOpen && deadline.overdue ? 'var(--danger)' : 'var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
            {isManual ? report.title : isTask ? '📋 Task' : report.web_client_name}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {isManual ? `Reported ${report.report_date}` : isTask ? `Task due ${report.report_date}` : `EOD of ${report.report_date}`} · flagged by {report.filed_by} · resolve by {report.due_at.slice(0, 10)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {isManual && <SeverityBadge severity={report.severity} />}
        {isOpen ? (
          // suppressHydrationWarning: the label depends on the current time,
          // which differs by a few ms between the server render and hydration.
          <span suppressHydrationWarning style={{ fontSize: '0.75rem', fontWeight: '700', color: deadline.color, backgroundColor: deadline.bg, padding: '0.25rem 0.7rem', borderRadius: '1rem', whiteSpace: 'nowrap' }}>
            {deadline.label}
          </span>
        ) : (
          <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--success)', backgroundColor: 'rgba(34, 197, 94, 0.12)', padding: '0.25rem 0.7rem', borderRadius: '1rem', whiteSpace: 'nowrap' }}>
            ✅ Resolved{resolvedLate ? ' (late)' : ''}
          </span>
        )}
        </div>
      </div>

      {report.page_url && (
        <a href={report.page_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: '0.78rem', color: BRAND_COLOR, wordBreak: 'break-all', textDecoration: 'none', marginBottom: '0.6rem' }}>
          {report.page_url}
        </a>
      )}
      {report.work_done && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', whiteSpace: 'pre-wrap' }}>
          <Linkify text={report.work_done} />
        </div>
      )}

      {isManual && <QaManualDetails report={report} />}

      <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderLeft: '3px solid #f59e0b', borderRadius: '0.5rem', fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>{isManual ? 'Description' : 'QA note'}</div>
        <Linkify text={report.note} />
      </div>

      {!isOpen && (
        <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', backgroundColor: 'rgba(34, 197, 94, 0.06)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '0.5rem', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--success)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
            Your resolution · {new Date(parseUtc(report.resolved_at)).toLocaleString()}
          </div>
          <Linkify text={report.resolution_note} />
        </div>
      )}

      {isOpen && !resolving && (
        <button
          type="button"
          onClick={() => setResolving(true)}
          style={{ marginTop: '1rem', padding: '0.55rem 1.2rem', backgroundColor: BRAND_COLOR, color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: '600', fontSize: '0.85rem', cursor: 'pointer' }}
        >
          Resolve
        </button>
      )}

      {isOpen && resolving && (
        <div style={{ marginTop: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            What did you do to fix it?
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Describe the fix — e.g. replaced the broken link, re-published the page..."
            style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)', fontSize: '0.9rem', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
          />
          {error && <div style={{ fontSize: '0.8rem', color: 'var(--danger)', marginTop: '0.4rem' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
            <button type="button" onClick={submit} disabled={submitting} style={{ padding: '0.5rem 1.1rem', backgroundColor: BRAND_COLOR, color: 'white', border: 'none', borderRadius: '0.4rem', fontWeight: '600', fontSize: '0.82rem', cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Saving...' : 'Mark as resolved'}
            </button>
            <button type="button" onClick={() => setResolving(false)} style={{ padding: '0.5rem 1.1rem', backgroundColor: 'transparent', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '0.4rem', fontWeight: '600', fontSize: '0.82rem', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ManagerQaReports({ reports, resolveAction, resolveDays }) {
  const open = reports.filter((r) => r.status === 'open');
  const resolved = reports.filter((r) => r.status !== 'open');
  const overdueCount = open.filter((r) => deadlineInfo(r.due_at).overdue).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.35rem' }}>Reports</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          Issues QA has flagged on your EODs. You have {resolveDays} days from when a report is filed to
          resolve it — the dot on this tab keeps blinking until every report is resolved.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <StatPill label="Open" value={open.length} color="#f59e0b" />
        <StatPill label="Overdue" value={overdueCount} color="var(--danger)" />
        <StatPill label="Resolved" value={resolved.length} color="var(--success)" />
      </div>

      {reports.length === 0 ? (
        <div style={cardStyle}>
          <p style={{ color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>No QA reports — nothing flagged on your EODs.</p>
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h2 style={{ fontSize: '1.05rem', margin: 0, color: '#f59e0b' }}>Needs your attention</h2>
              {open.map((r) => <ReportCard key={r.id} report={r} resolveAction={resolveAction} />)}
            </div>
          )}
          {resolved.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Resolved</h2>
              {resolved.map((r) => <ReportCard key={r.id} report={r} resolveAction={resolveAction} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
