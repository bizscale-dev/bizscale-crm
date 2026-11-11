'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createQaTask } from './actions';
import { ROLE_GROUPS, ROLE_LABELS } from './roles';
import TaskBadges from '@/components/TaskBadges';
import UrgencySelect from '@/components/UrgencySelect';
import { formatPkt, pktDay, dayLabel } from '@/lib/formatTime';

const cardStyle = { backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '1.5rem' };
const labelStyle = { display: 'block', marginBottom: '0.4rem', fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.02em' };
const inputStyle = { width: '100%', padding: '0.6rem 0.85rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };

function formatDue12h(due) {
  const m = /^(\d{1,2}):(\d{2})/.exec(due || '');
  if (!m) return due || '';
  const h = parseInt(m[1], 10);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

function TaskCard({ task }) {
  const [open, setOpen] = useState(false);
  const done = task.assignees.filter((a) => a.submitted_at).length;
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
          <TaskBadges urgency={task.urgency} isDefault={false} />{task.task_text}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <div>Due {task.due_date} {formatDue12h(task.due_time)}</div>
          <div style={{ color: done === task.assignees.length ? 'var(--success)' : '#f59e0b', fontWeight: '600' }}>{done}/{task.assignees.length} submitted</div>
        </div>
      </div>
      {open && (
        <div style={{ marginTop: '0.9rem', paddingTop: '0.9rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {task.assignees.map((a) => (
            <div key={a.id} style={{ fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong>{a.name}</strong>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{ROLE_LABELS[a.role] || a.role}</span>
                {a.submitted_at ? (
                  <span style={{ fontSize: '0.72rem', fontWeight: '600', color: a.is_late ? '#f59e0b' : 'var(--success)' }}>
                    Submitted {formatPkt(a.submitted_at)}{a.is_late ? ' · late' : ''}
                  </span>
                ) : (
                  <span style={{ fontSize: '0.72rem', fontWeight: '600', color: 'var(--text-muted)' }}>Pending</span>
                )}
              </div>
              {a.submitted_at && a.description && (
                <div style={{ marginTop: '0.25rem', padding: '0.5rem 0.75rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '0.4rem', whiteSpace: 'pre-wrap' }}>{a.description}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AssignTasksClient({ people, tasks }) {
  const router = useRouter();
  const [taskText, setTaskText] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [urgency, setUrgency] = useState('moderate');
  const [selected, setSelected] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const groups = ROLE_GROUPS
    .map((g) => ({ ...g, people: people.filter((p) => g.roles.includes(p.role)) }))
    .filter((g) => g.people.length > 0);

  const toggle = (id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleGroup = (g) => {
    const ids = g.people.map((p) => p.id);
    const all = ids.every((id) => selected.includes(id));
    setSelected((prev) => (all ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const formData = new FormData();
    formData.set('task_text', taskText);
    formData.set('due_date', dueDate);
    formData.set('due_time', dueTime);
    formData.set('urgency', urgency);
    selected.forEach((id) => formData.append('assignee_ids', id));
    const result = await createQaTask(formData);
    setSubmitting(false);
    if (result?.error) return setMessage({ type: 'error', text: result.error });
    setMessage({ type: 'success', text: `Task assigned to ${result.assignedCount} ${result.assignedCount === 1 ? 'person' : 'people'}.` });
    setTaskText(''); setDueDate(''); setDueTime(''); setUrgency('moderate'); setSelected([]);
    router.refresh();
  };

  // Newest first, grouped by the Pakistan day the task was assigned.
  const days = [];
  for (const t of tasks) {
    const day = pktDay(t.created_at);
    const last = days[days.length - 1];
    if (last && last.day === day) last.tasks.push(t); else days.push({ day, tasks: [t] });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.35rem' }}>Assign Task</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          Give a task to managers, associates, the Web Developer, Graphics Designers or writers. They get a notification and submit it from their own Tasks page; you see their answer below.
        </p>
      </div>

      <div style={cardStyle}>
        {message && (
          <div style={{ padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.875rem', backgroundColor: message.type === 'error' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(22, 178, 147, 0.1)', color: message.type === 'error' ? 'var(--danger)' : 'var(--success)' }}>
            {message.text}
          </div>
        )}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Task</label>
            <textarea value={taskText} onChange={(e) => setTaskText(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Describe the task…" />
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <label style={labelStyle}>Due date</label>
              <input type="date" className="date-input-brand" value={dueDate} onChange={(e) => setDueDate(e.target.value)} onClick={(e) => e.target.showPicker?.()} style={inputStyle} />
            </div>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <label style={labelStyle}>Due time</label>
              <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <UrgencySelect value={urgency} onChange={setUrgency} labelStyle={labelStyle} inputStyle={inputStyle} />
          <div>
            <label style={labelStyle}>Assign to · {selected.length} selected</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              {groups.map((g) => {
                const all = g.people.every((p) => selected.includes(p.id));
                return (
                  <div key={g.label} style={{ border: '1px solid var(--border)', borderRadius: '0.6rem', padding: '0.7rem 0.9rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: '700' }}>{g.label}</span>
                      <button type="button" onClick={() => toggleGroup(g)} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}>
                        {all ? 'Clear' : 'Select all'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.1rem' }}>
                      {g.people.map((p) => (
                        <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                          <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                          {p.name}
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{ROLE_LABELS[p.role]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              {groups.length === 0 && <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.85rem' }}>No active people to assign to yet.</p>}
            </div>
          </div>
          <div>
            <button type="submit" disabled={submitting} className="btn" style={{ padding: '0.6rem 1.5rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: '600', cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Assigning…' : 'Assign Task'}
            </button>
          </div>
        </form>
      </div>

      <div>
        <h2 style={{ fontSize: '1.1rem', margin: '0 0 1rem' }}>Tasks you assigned</h2>
        {days.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Nothing assigned yet.</p>
        ) : days.map((d) => (
          <div key={d.day} style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '0.6rem' }}>
              {dayLabel(d.day)} · {d.tasks.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {d.tasks.map((t) => <TaskCard key={t.key} task={t} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
