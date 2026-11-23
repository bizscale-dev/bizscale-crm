'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import UrgencySelect from '@/components/UrgencySelect';

const labelStyle = {
  display: 'block', marginBottom: '0.3rem', fontSize: '0.72rem', fontWeight: '600',
  color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.02em',
};
const inputStyle = {
  width: '100%', padding: '0.5rem 0.7rem', borderRadius: '0.5rem', border: '1px solid var(--border)',
  backgroundColor: 'var(--background)', color: 'var(--foreground)', fontSize: '0.875rem',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};
const smallBtn = {
  padding: '0.3rem 0.75rem', borderRadius: '0.4rem', border: '1px solid var(--border)',
  backgroundColor: 'transparent', color: 'var(--foreground)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '600',
};

// Edit / Delete for a task the signed-in manager assigned. Used by every Associate Tasks page.
export default function TaskOwnerControls({ task, onUpdate, onDelete }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(task.task_text);
  const [date, setDate] = useState(task.due_date);
  const [time, setTime] = useState(task.due_time || '');
  const [urgency, setUrgency] = useState(task.urgency || 'moderate');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(fn) {
    setBusy(true);
    setError('');
    const res = await fn();
    setBusy(false);
    if (res?.error) { setError(res.error); return false; }
    router.refresh();
    return true;
  }

  async function save() {
    const ok = await run(() => onUpdate(task.id, { taskText: text, dueDate: date, dueTime: time, urgency }));
    if (ok) setEditing(false);
  }

  async function remove() {
    if (!confirm('Delete this task? It disappears for everyone it was assigned to, together with their submissions.')) return;
    await run(() => onDelete(task.id));
  }

  if (!editing) {
    return (
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <button type="button" onClick={() => setEditing(true)} disabled={busy} style={smallBtn}>✏️ Edit</button>
        <button type="button" onClick={remove} disabled={busy}
          style={{ ...smallBtn, border: '1px solid var(--danger)', color: 'var(--danger)' }}>🗑 Delete</button>
        {error && <span style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>{error}</span>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', margin: '0 0 0.9rem', padding: '0.9rem', border: '1px solid var(--border)', borderRadius: '0.6rem', backgroundColor: 'var(--background)' }}>
      <div>
        <label style={labelStyle}>Task</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label style={labelStyle}>Due Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} onClick={(e) => e.target.showPicker?.()} style={{ ...inputStyle, cursor: 'pointer' }} />
        </div>
        <div>
          <label style={labelStyle}>Due Time</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} onClick={(e) => e.target.showPicker?.()} style={{ ...inputStyle, cursor: 'pointer' }} />
        </div>
      </div>
      <UrgencySelect value={urgency} onChange={setUrgency} labelStyle={labelStyle} inputStyle={inputStyle} />
      {error && <div style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>{error}</div>}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="button" onClick={save} disabled={busy}
          style={{ ...smallBtn, backgroundColor: 'var(--primary)', color: 'white', border: 'none', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={() => { setEditing(false); setError(''); }} disabled={busy} style={smallBtn}>Cancel</button>
      </div>
    </div>
  );
}
