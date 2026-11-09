'use client';

import { useState } from 'react';
import TaskBadges from '@/components/TaskBadges';
import { formatPkt, pktDay, dayLabel } from '@/lib/formatTime';
import { setTaskCheck, reportTask } from '@/lib/taskCheckActions';

const ghostBtn = { fontSize: '0.78rem', padding: '0.3rem 0.8rem', backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--foreground)', cursor: 'pointer', borderRadius: '0.4rem', fontWeight: '600' };
const FILTERS = [['all', 'All'], ['unchecked', 'Unchecked'], ['pass', 'Passed'], ['fail', 'Failed']];

function formatDue12h(due) {
  const m = /^(\d{1,2}):(\d{2})/.exec(due || '');
  if (!m) return due || '';
  const h = parseInt(m[1], 10);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

function TaskCard({ task, targetLabel }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(task.check_status || '');
  const [reports, setReports] = useState(task.report_count);
  const [reporting, setReporting] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const mark = async (next) => {
    const value = status === next ? '' : next;
    const before = status;
    setStatus(value);
    const res = await setTaskCheck({ taskId: task.task_id, userId: task.user_id, status: value });
    if (res?.error) { setStatus(before); setMessage({ error: true, text: res.error }); }
  };

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await reportTask({ taskId: task.task_id, userId: task.user_id, comment });
    setBusy(false);
    if (res?.error) return setMessage({ error: true, text: res.error });
    setStatus('fail');
    setReports((n) => n + 1);
    setReporting(false);
    setComment('');
    setMessage({ text: `Reported — ${res.name} has been notified.` });
  };

  const pass = status === 'pass';
  const fail = status === 'fail';
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '1rem 1.25rem', backgroundColor: 'var(--card-bg)' }}>
      <div
        role="button" tabIndex={0} aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); } }}
        style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', cursor: 'pointer', alignItems: 'flex-start' }}
      >
        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: '1.4rem', flexShrink: 0 }}>{open ? '▾' : '▸'}</span>
        <div style={{ fontSize: '0.92rem', flex: 1, minWidth: 0, ...(open ? { whiteSpace: 'pre-wrap' } : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) }}>
          <TaskBadges urgency={task.urgency} isDefault={!!task.template_id} />{task.task_text}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{task.assignee_name}</span>
          {status === 'pass' && <span style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--success)' }}>✓ PASS</span>}
          {status === 'fail' && <span style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--danger)' }}>✕ FAIL{reports > 0 ? ` · ${reports} report${reports === 1 ? '' : 's'}` : ''}</span>}
        </div>
      </div>

      {open && (
        <div style={{ marginTop: '0.9rem', paddingTop: '0.9rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
            {task.assigned_by && <span>Assigned by <strong style={{ color: 'var(--foreground)' }}>{task.assigned_by}</strong></span>}
            <span>Due {task.due_date} {task.template_id ? '12 AM' : formatDue12h(task.due_time)}</span>
            <span>Submitted {formatPkt(task.submitted_at)}{task.is_late ? ' · late' : ''}</span>
          </div>
          {!!task.is_late && task.late_reason && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Late reason: {task.late_reason}</div>
          )}
          <div style={{ fontSize: '0.88rem', whiteSpace: 'pre-wrap' }}>{task.submission_description || <span style={{ color: 'var(--text-muted)' }}>No description.</span>}</div>
          {task.has_proof ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/task-proof/${task.assignee_id}`} alt="Proof" loading="lazy" style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '0.5rem', border: '1px solid var(--border)' }} />
          ) : null}

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" onClick={() => mark('pass')} style={{ ...ghostBtn, ...(pass ? { backgroundColor: 'var(--success)', borderColor: 'var(--success)', color: 'white' } : { color: 'var(--success)', borderColor: 'var(--success)' }) }}>✓ Pass</button>
            <button type="button" onClick={() => mark('fail')} style={{ ...ghostBtn, ...(fail ? { backgroundColor: 'var(--danger)', borderColor: 'var(--danger)', color: 'white' } : { color: 'var(--danger)', borderColor: 'var(--danger)' }) }}>✕ Fail</button>
            <button type="button" onClick={() => setReporting(!reporting)} style={{ ...ghostBtn, ...(reporting ? { backgroundColor: 'var(--primary)', borderColor: 'var(--primary)', color: 'white' } : {}) }}>
              {reporting ? 'Cancel' : 'Report'}
            </button>
            {message && <span style={{ fontSize: '0.78rem', color: message.error ? 'var(--danger)' : 'var(--success)' }}>{message.text}</span>}
          </div>

          {reporting && (
            <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '0.5rem', backgroundColor: 'var(--background)' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Reporting this task to {task.assignee_name} ({targetLabel})</div>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Comment (optional) — where exactly the issue is…"
                style={{ width: '100%', padding: '0.55rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--card-bg)', color: 'var(--foreground)', fontSize: '0.875rem', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }} />
              <div>
                <button type="submit" disabled={busy} className="btn" style={{ padding: '0.45rem 1.1rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: '600', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                  {busy ? 'Sending…' : 'Send report'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default function CheckClient({ tasks, targetLabel, people }) {
  const [filter, setFilter] = useState('all');
  const [person, setPerson] = useState('');

  const visible = tasks.filter((t) => {
    if (person && String(t.user_id) !== person) return false;
    if (filter === 'unchecked') return !t.check_status;
    if (filter === 'pass' || filter === 'fail') return t.check_status === filter;
    return true;
  });

  // Newest submission first, grouped by the Pakistan day it was submitted.
  const groups = [];
  for (const t of visible) {
    const day = pktDay(t.submitted_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.tasks.push(t); else groups.push({ day, tasks: [t] });
  }
  const unchecked = tasks.filter((t) => !t.check_status).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {FILTERS.map(([value, label]) => (
          <button key={value} type="button" onClick={() => setFilter(value)}
            style={{ padding: '0.35rem 1rem', borderRadius: '2rem', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', border: '1px solid var(--primary)', color: filter === value ? 'white' : 'var(--primary)', backgroundColor: filter === value ? 'var(--primary)' : 'transparent' }}>
            {label}{value === 'unchecked' ? ` · ${unchecked}` : ''}
          </button>
        ))}
        {people.length > 1 && (
          <select value={person} onChange={(e) => setPerson(e.target.value)} style={{ padding: '0.45rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)', fontSize: '0.85rem' }}>
            <option value="">All {targetLabel}s</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {groups.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No submitted tasks{filter !== 'all' || person ? ' match this filter' : ' yet'}.</p>
      ) : groups.map((g) => (
        <div key={g.day}>
          <div style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '0.6rem' }}>
            {dayLabel(g.day)} · {g.tasks.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {g.tasks.map((t) => <TaskCard key={`${t.task_id}-${t.user_id}`} task={t} targetLabel={targetLabel} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
