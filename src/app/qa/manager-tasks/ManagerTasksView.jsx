'use client';

import { useMemo, useState } from 'react';
import { cardStyle, selectStyle, formatMonth, StatPill, BRAND_COLOR } from '../qaStyles';
import Linkify from '../Linkify';
import { reportManagerTask } from './actions';
import ResolveDaysInput from '@/components/ResolveDaysInput';

const ROLE_LABELS = {
  seo_manager: 'SEO Manager',
  web_seo_manager: 'Web SEO Manager',
  writers_manager: 'Writers Manager',
};

const STATUS_STYLES = {
  pending: { text: '⏳ Pending', color: '#f59e0b' },
  submitted: { text: '✅ Submitted', color: 'var(--success)' },
  late_pending: { text: '🟠 Late — pending review', color: '#f59e0b' },
  late_approved: { text: '✅ Late — approved', color: 'var(--success)' },
  late_rejected: { text: '❌ Late — rejected', color: 'var(--danger)' },
};

function statusFor(row) {
  if (!row.submitted_at) return STATUS_STYLES.pending;
  if (!row.is_late) return STATUS_STYLES.submitted;
  if (row.approval_status === 'approved') return STATUS_STYLES.late_approved;
  if (row.approval_status === 'rejected') return STATUS_STYLES.late_rejected;
  return STATUS_STYLES.late_pending;
}

export default function ManagerTasksView({ rows, initialReportCounts }) {
  const [reportCounts, setReportCounts] = useState(initialReportCounts);
  const people = useMemo(() => {
    const seen = new Map();
    for (const r of rows) seen.set(r.manager_id, r.manager_name);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const months = useMemo(() => {
    const set = new Set(rows.map((r) => r.due_date.slice(0, 7)));
    return [...set].sort().reverse();
  }, [rows]);

  const [personId, setPersonId] = useState('');
  const [month, setMonth] = useState(months[0] || '');

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (personId && String(r.manager_id) !== personId) return false;
      if (month && r.due_date.slice(0, 7) !== month) return false;
      return true;
    });
  }, [rows, personId, month]);

  const total = filtered.length;
  const completed = filtered.filter((r) => !!r.submitted_at).length;
  const pending = total - completed;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.35rem' }}>Managers Tasks</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          Every task admin has assigned to managers.
        </p>
      </div>

      <div style={{ ...cardStyle, display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={personId} onChange={(e) => setPersonId(e.target.value)} style={selectStyle}>
          <option value="">All People</option>
          {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={month} onChange={(e) => setMonth(e.target.value)} style={selectStyle}>
          <option value="">All Months</option>
          {months.map((ym) => <option key={ym} value={ym}>{formatMonth(ym)}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <StatPill label="Total Tasks" value={total} color={BRAND_COLOR} />
        <StatPill label="Completed" value={completed} color="var(--success)" />
        <StatPill label="Pending" value={pending} color="#f59e0b" />
      </div>

      {filtered.length === 0 ? (
        <div style={cardStyle}>
          <p style={{ color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>No tasks match these filters.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filtered.map((r) => (
            <TaskCard
              key={r.assignee_id}
              row={r}
              flagCount={reportCounts[r.assignee_id] || 0}
              onReported={() => setReportCounts((prev) => ({ ...prev, [r.assignee_id]: (prev[r.assignee_id] || 0) + 1 }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskCard({ row, flagCount, onReported }) {
  const [expanded, setExpanded] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState('');
  const [resolveDays, setResolveDays] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const submitReport = async () => {
    setSubmitting(true);
    setError(null);
    const result = await reportManagerTask(row.assignee_id, note, resolveDays);
    setSubmitting(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    onReported();
    setReporting(false);
    setNote('');
    setResolveDays('');
  };

  const status = statusFor(row);
  const canExpand = !!row.submitted_at;

  return (
    <div style={cardStyle}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', cursor: canExpand ? 'pointer' : 'default' }}
        onClick={() => canExpand && setExpanded((e) => !e)}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
            <span style={{ fontWeight: '600' }}>{row.manager_name}</span>
            <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '1rem', backgroundColor: 'rgba(22, 178, 147, 0.1)', color: BRAND_COLOR, fontWeight: '600' }}>
              {ROLE_LABELS[row.manager_role] || row.manager_role}
            </span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Assigned by Admin · Due {row.due_date} {row.template_id ? '(12 AM)' : row.due_time}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {flagCount > 0 && (
            <span style={{ fontSize: '0.68rem', fontWeight: '600', color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.12)', padding: '0.1rem 0.45rem', borderRadius: '1rem', whiteSpace: 'nowrap' }}>
              ⚑ Flagged{flagCount > 1 ? ` ×${flagCount}` : ''}
            </span>
          )}
          <span style={{ fontSize: '0.8rem', fontWeight: '600', color: status.color, whiteSpace: 'nowrap' }}>{status.text}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setReporting(true); setError(null); }}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '0.4rem', padding: '0.2rem 0.55rem', fontSize: '0.7rem', fontWeight: '600', color: 'var(--foreground)', cursor: 'pointer' }}
          >
            Report
          </button>
        </div>
      </div>

      {reporting && (
        <div style={{ marginTop: '0.75rem', padding: '0.75rem', border: '1px solid rgba(245, 158, 11, 0.45)', borderRadius: '0.5rem', backgroundColor: 'rgba(245, 158, 11, 0.05)' }}>
          <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            What’s wrong with this task?
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Add a note — e.g. submission doesn't match the task, proof is missing or unclear..."
            style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)', fontSize: '0.9rem', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div style={{ marginTop: '0.6rem' }}>
            <ResolveDaysInput
              value={resolveDays}
              onChange={setResolveDays}
              labelStyle={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.02em' }}
              inputStyle={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)', fontSize: '0.9rem', boxSizing: 'border-box' }}
            />
          </div>
          {error && <div style={{ fontSize: '0.78rem', color: 'var(--danger)', marginTop: '0.4rem' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
            <button type="button" onClick={submitReport} disabled={submitting} style={{ padding: '0.45rem 1rem', backgroundColor: '#f59e0b', color: 'white', border: 'none', borderRadius: '0.4rem', fontWeight: '600', fontSize: '0.8rem', cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Submitting...' : 'Submit report'}
            </button>
            <button type="button" onClick={() => setReporting(false)} style={{ padding: '0.45rem 1rem', backgroundColor: 'transparent', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '0.4rem', fontWeight: '600', fontSize: '0.8rem', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
        {row.template_id ? '🔁 ' : ''}<Linkify text={row.task_text} />
      </div>

      {canExpand && expanded && (
        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            Submitted {new Date(row.submitted_at).toLocaleString()}
            {row.is_late && row.late_reason && <><br />Late reason: {row.late_reason}</>}
          </div>
          <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem', whiteSpace: 'pre-wrap' }}><Linkify text={row.submission_description} /></div>
          {row.proof_image_base64 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.proof_image_base64} alt="Proof" style={{ maxWidth: '100%', maxHeight: '350px', borderRadius: '0.5rem', border: '1px solid var(--border)' }} />
          )}
        </div>
      )}
    </div>
  );
}
