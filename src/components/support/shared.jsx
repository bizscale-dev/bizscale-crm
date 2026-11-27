'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Linkify from '@/app/qa/Linkify';
import TaskBadges from '@/components/TaskBadges';
import { formatPkt } from '@/lib/formatTime';
import { withClient } from '@/lib/supportText';

export const cardStyle = { backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '1.1rem 1.25rem' };
export const inputStyle = { width: '100%', padding: '0.55rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)', fontSize: '0.9rem', fontFamily: 'inherit' };
export const labelStyle = { display: 'block', marginBottom: '0.35rem', fontSize: '0.72rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' };
export const primaryBtn = { padding: '0.55rem 1.2rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem' };
export const ghostBtn = { padding: '0.5rem 1rem', backgroundColor: 'transparent', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem' };
export const mutedStyle = { fontSize: '0.78rem', color: 'var(--text-muted)' };
const textStyle = { fontSize: '0.93rem', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' };

const AMBER = '#f59e0b';
const GREEN = 'var(--success)';
const RED = 'var(--danger)';

export function Pill({ text, color }) {
  return <span style={{ fontSize: '0.7rem', fontWeight: '700', color, border: `1px solid ${color}`, padding: '0.1rem 0.55rem', borderRadius: '1rem', whiteSpace: 'nowrap' }}>{text}</span>;
}

// Runs a server action, shows its error, refreshes the page data on success.
export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (fn, onDone) => {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (result?.error) setError(result.error);
      else {
        onDone?.();
        router.refresh();
      }
    } catch {
      setError('Something went wrong — please try again.');
    }
    setBusy(false);
  };
  return { busy, error, run };
}

// Keeps an open page up to date (new replies, decisions) without a manual reload.
export function useAutoRefresh(ms = 60000) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), ms);
    return () => clearInterval(id);
  }, [router, ms]);
}

export function ErrorText({ error }) {
  return error ? <div role="alert" style={{ color: 'var(--danger)', fontSize: '0.82rem', marginTop: '0.4rem' }}>{error}</div> : null;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
      {tabs.map((t) => (
        <button key={t.value} type="button" onClick={() => onChange(t.value)} style={value === t.value ? primaryBtn : ghostBtn}>
          {t.label}{t.count != null ? ` (${t.count})` : ''}
        </button>
      ))}
    </div>
  );
}

// Optional client from the SEO client list. A value that has since left the list stays selectable.
export function ClientSelect({ id, clients, value, onChange }) {
  const options = value && !clients.includes(value) ? [value, ...clients] : clients;
  return (
    <div>
      <label style={labelStyle} htmlFor={id}>Client (optional)</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        <option value="">No client</option>
        {options.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );
}

function ClientTag({ name }) {
  return name ? <div style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--primary)', marginBottom: '0.35rem' }}>Client: {name}</div> : null;
}

/* ---------- Queries ---------- */

function queryStatus(q) {
  if (q.status === 'pending') return { text: 'Waiting for admin', color: AMBER };
  if (q.status === 'rejected') return { text: 'Rejected by admin', color: RED };
  return q.replies.length ? { text: 'Answered', color: GREEN } : { text: 'Sent to Support · no reply yet', color: AMBER };
}

export function QueryCard({ query, showFrom, showSentTo = true, children }) {
  const status = queryStatus(query);
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <span style={mutedStyle}>
          {showFrom && <strong style={{ color: 'var(--foreground)' }}>{query.from_name || 'Removed user'} · </strong>}
          {formatPkt(query.created_at)}
        </span>
        <Pill text={status.text} color={status.color} />
      </div>
      <ClientTag name={query.client_name} />
      <div style={textStyle}><Linkify text={query.query_text} /></div>
      {showSentTo && query.sentTo.length > 0 && <div style={{ ...mutedStyle, marginTop: '0.5rem' }}>Sent to: {query.sentTo.join(', ')}</div>}
      {query.status === 'rejected' && query.admin_note && <div style={{ fontSize: '0.83rem', color: 'var(--danger)', marginTop: '0.5rem' }}>Reason: {query.admin_note}</div>}
      {query.replies.map((r) => (
        <div key={r.id} style={{ marginTop: '0.7rem', padding: '0.6rem 0.8rem', borderLeft: '3px solid var(--primary)', backgroundColor: 'var(--background)', borderRadius: '0 0.5rem 0.5rem 0' }}>
          <div style={{ ...mutedStyle, marginBottom: '0.25rem' }}><strong style={{ color: 'var(--primary)' }}>{r.name}</strong> · {formatPkt(r.created_at)}</div>
          <div style={textStyle}><Linkify text={r.text} /></div>
        </div>
      ))}
      {children}
    </div>
  );
}

/* ---------- Tasks ---------- */

function assigneeStatus(a) {
  if (!a.submitted_at) return { text: 'Pending', color: AMBER };
  if (a.approval_status === 'rejected') return { text: 'Not approved', color: RED };
  if (a.approval_status === 'pending') return { text: 'Submitted late · waiting for admin', color: AMBER };
  if (a.approval_status === 'approved') return a.is_late ? { text: 'Approved · late', color: GREEN } : { text: 'Approved · on time', color: GREEN };
  return { text: 'Submitted', color: GREEN };
}

function taskStatus(t) {
  if (t.status === 'pending') return { text: 'Waiting for admin', color: AMBER };
  if (t.status === 'rejected') return { text: 'Rejected by admin', color: RED };
  if (t.assignees.length === 0) return { text: 'Removed', color: 'var(--text-muted)' };
  const done = t.assignees.filter((a) => a.submitted_at && a.approval_status !== 'rejected').length;
  return { text: `${done}/${t.assignees.length} submitted`, color: done === t.assignees.length ? GREEN : AMBER };
}

export function TaskCard({ task, showFrom, children }) {
  const status = taskStatus(task);
  const sent = task.status === 'forwarded' && task.sent_text != null;
  const edited = sent && task.sent_text !== withClient(task.client_name, task.task_text);
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <span style={mutedStyle}>
          {showFrom && <strong style={{ color: 'var(--foreground)' }}>{task.from_name || 'Removed user'} · </strong>}
          {formatPkt(task.created_at)} · due {sent ? `${task.sent_due_date} ${task.sent_due_time}` : `${task.due_date} ${task.due_time}`}
        </span>
        <Pill text={status.text} color={status.color} />
      </div>
      <ClientTag name={task.client_name} />
      <div style={textStyle}><TaskBadges urgency={sent ? task.sent_urgency : task.urgency} /><Linkify text={task.task_text} /></div>
      {edited && <div style={{ ...mutedStyle, marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>Sent to managers as: <Linkify text={task.sent_text} /></div>}
      {task.status === 'rejected' && task.admin_note && <div style={{ fontSize: '0.83rem', color: 'var(--danger)', marginTop: '0.5rem' }}>Reason: {task.admin_note}</div>}
      {task.assignees.map((a) => {
        const s = assigneeStatus(a);
        return (
          <div key={a.id} style={{ marginTop: '0.7rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: '600', fontSize: '0.87rem' }}>{a.name}</span>
              <Pill text={s.text} color={s.color} />
              {a.submitted_at && <span style={mutedStyle}>{formatPkt(a.submitted_at)}</span>}
            </div>
            {a.description && <div style={{ ...textStyle, fontSize: '0.85rem', marginTop: '0.35rem' }}><Linkify text={a.description} /></div>}
            {a.late_reason && <div style={{ ...mutedStyle, marginTop: '0.25rem' }}>Late reason: {a.late_reason}</div>}
            {a.proof_url && <a href={a.proof_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--primary)', marginTop: '0.3rem' }}>View proof picture ↗</a>}
          </div>
        );
      })}
      {children}
    </div>
  );
}
