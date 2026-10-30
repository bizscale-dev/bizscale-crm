'use client';

import { useMemo, useState } from 'react';
import { cardStyle, selectStyle, formatMonth, StatPill, BRAND_COLOR } from '../hrStyles';
import TaskBadges from '@/components/TaskBadges';

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

export default function ManagerTasksView({ rows }) {
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
  const [lateOnly, setLateOnly] = useState(false);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (personId && String(r.manager_id) !== personId) return false;
      if (month && r.due_date.slice(0, 7) !== month) return false;
      if (lateOnly && !(r.submitted_at && r.is_late)) return false;
      return true;
    });
  }, [rows, personId, month, lateOnly]);

  const total = filtered.length;
  const completed = filtered.filter((r) => !!r.submitted_at).length;
  const pending = total - completed;
  const late = filtered.filter((r) => r.submitted_at && r.is_late).length;

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
        <select value={lateOnly ? 'late' : ''} onChange={(e) => setLateOnly(e.target.value === 'late')} style={selectStyle}>
          <option value="">All Tasks</option>
          <option value="late">Late Submissions Only</option>
        </select>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <StatPill label="Total Tasks" value={total} color={BRAND_COLOR} />
        <StatPill label="Completed" value={completed} color="var(--success)" />
        <StatPill label="Pending" value={pending} color="#f59e0b" />
        <StatPill label="Late Submissions" value={late} color="#f97316" />
      </div>

      {filtered.length === 0 ? (
        <div style={cardStyle}>
          <p style={{ color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>No tasks match these filters.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filtered.map((r) => <TaskCard key={r.assignee_id} row={r} />)}
        </div>
      )}
    </div>
  );
}

function TaskCard({ row }) {
  const [expanded, setExpanded] = useState(false);
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
        <span style={{ fontSize: '0.8rem', fontWeight: '600', color: status.color, whiteSpace: 'nowrap' }}>{status.text}</span>
      </div>

      <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
        <TaskBadges urgency={row.urgency} isDefault={!!(row.template_id || row.is_default)} />{row.task_text}
      </div>

      {canExpand && expanded && (
        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            Submitted {new Date(row.submitted_at).toLocaleString()}
            {row.is_late && row.late_reason && <><br />Late reason: {row.late_reason}</>}
          </div>
          <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem', whiteSpace: 'pre-wrap' }}>{row.submission_description}</div>
          {row.proof_image_base64 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.proof_image_base64} alt="Proof" style={{ maxWidth: '100%', maxHeight: '350px', borderRadius: '0.5rem', border: '1px solid var(--border)' }} />
          )}
        </div>
      )}
    </div>
  );
}
