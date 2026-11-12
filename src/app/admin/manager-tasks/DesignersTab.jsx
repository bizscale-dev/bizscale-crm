'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createDesignerTask, createDesignerBulkTasks } from './designerActions';
import TaskBadges from '@/components/TaskBadges';
import UrgencySelect from '@/components/UrgencySelect';
import ImageAttachField from '@/components/ImageAttachField';
import { formatPkt } from '@/lib/formatTime';

const labelStyle = { display: 'block', marginBottom: '0.4rem', fontSize: '0.72rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' };
const inputStyle = { width: '100%', padding: '0.6rem 0.85rem', borderRadius: '0.6rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)', fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
const primaryButtonStyle = { padding: '0.7rem 1.5rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '0.6rem', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem' };
const cardStyle = { backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '0.9rem', padding: '1.5rem' };

const labelOf = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const shift = (iso, days) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
function due12h(due) {
  const m = /^(\d{1,2}):(\d{2})/.exec(due || '');
  if (!m) return due || '';
  const h = parseInt(m[1], 10);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

function DesignerPicker({ designers, selected, setSelected }) {
  const all = designers.length > 0 && designers.every((d) => selected.includes(d.id));
  return (
    <div>
      <label style={labelStyle}>Assign to · {selected.length} selected</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.1rem', alignItems: 'center' }}>
        {designers.map((d) => (
          <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={selected.includes(d.id)} onChange={() => setSelected((p) => (p.includes(d.id) ? p.filter((x) => x !== d.id) : [...p, d.id]))} />
            {d.name}
          </label>
        ))}
        {designers.length > 1 && (
          <button type="button" onClick={() => setSelected(all ? [] : designers.map((d) => d.id))} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' }}>
            {all ? 'Clear' : 'Select all'}
          </button>
        )}
        {designers.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No active Graphics Designers yet.</span>}
      </div>
    </div>
  );
}

function Notice({ message }) {
  if (!message) return null;
  return (
    <div style={{ padding: '0.75rem 1rem', borderRadius: '0.5rem', fontSize: '0.875rem', backgroundColor: message.error ? 'rgba(220, 38, 38, 0.1)' : 'rgba(22, 178, 147, 0.1)', color: message.error ? 'var(--danger)' : 'var(--success)' }}>
      {message.text}
    </div>
  );
}

function SingleForm({ designers }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [urgency, setUrgency] = useState('moderate');
  const [image, setImage] = useState(null);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const fd = new FormData();
    fd.set('task_text', text); fd.set('due_date', dueDate); fd.set('due_time', dueTime); fd.set('urgency', urgency);
    if (image) fd.set('attachment', image);
    selected.forEach((id) => fd.append('assignee_ids', id));
    const res = await createDesignerTask(fd);
    setBusy(false);
    if (res?.error) return setMessage({ error: true, text: res.error });
    setMessage({ text: `Task assigned to ${res.assignedCount} designer${res.assignedCount === 1 ? '' : 's'}.` });
    setText(''); setDueDate(''); setDueTime(''); setUrgency('moderate'); setImage(null); setSelected([]);
    router.refresh();
  };

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Notice message={message} />
      <div>
        <label style={labelStyle}>Task</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Describe the design task…" />
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
      <ImageAttachField value={image} onChange={setImage} />
      <DesignerPicker designers={designers} selected={selected} setSelected={setSelected} />
      <div><button type="submit" disabled={busy} style={{ ...primaryButtonStyle, opacity: busy ? 0.6 : 1 }}>{busy ? 'Assigning…' : 'Assign task'}</button></div>
    </form>
  );
}

function BulkForm({ designers }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [dates, setDates] = useState([]);
  const [pick, setPick] = useState('');
  const [lead, setLead] = useState(2);
  const [dueTime, setDueTime] = useState('23:59');
  const [urgency, setUrgency] = useState('moderate');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const addDate = () => {
    if (!pick) return;
    setDates((prev) => (prev.includes(pick) ? prev : [...prev, pick].sort()));
    setPick('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await createDesignerBulkTasks({ taskText: text, dates, leadDays: lead, dueTime, urgency, assigneeIds: selected });
    setBusy(false);
    if (res?.error) return setMessage({ error: true, text: res.error });
    setMessage({ text: `${res.taskCount} task${res.taskCount === 1 ? '' : 's'} created for ${res.assignedCount} designer${res.assignedCount === 1 ? '' : 's'}.` });
    setText(''); setDates([]); setSelected([]);
    router.refresh();
  };

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Notice message={message} />
      <div>
        <label style={labelStyle}>Task (one text — each date becomes its own task)</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="e.g. Design the social media post for the day…" />
      </div>

      <div>
        <label style={labelStyle}>Dates</label>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" className="date-input-brand" value={pick} onChange={(e) => setPick(e.target.value)} onClick={(e) => e.target.showPicker?.()}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDate(); } }} style={{ ...inputStyle, width: 'auto' }} />
          <button type="button" onClick={addDate} disabled={!pick} style={{ ...primaryButtonStyle, padding: '0.55rem 1.1rem', opacity: pick ? 1 : 0.5 }}>+ Add date</button>
          {dates.length > 0 && <button type="button" onClick={() => setDates([])} style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '0.8rem', cursor: 'pointer' }}>Clear dates</button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={labelStyle}>Finish how many days before each date</label>
          <input type="number" min={0} max={30} value={lead} onChange={(e) => setLead(e.target.value === '' ? '' : Math.min(30, Math.max(0, parseInt(e.target.value, 10) || 0)))} style={inputStyle} />
        </div>
        <div style={{ flex: 1, minWidth: '160px' }}>
          <label style={labelStyle}>Due time</label>
          <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} style={inputStyle} />
        </div>
      </div>

      {dates.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: '0.6rem', overflow: 'hidden' }}>
          {dates.map((d) => (
            <div key={d} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '0.55rem 0.9rem', borderBottom: '1px solid var(--border)', fontSize: '0.85rem' }}>
              <span><strong>{labelOf(d)}</strong> <span style={{ color: 'var(--text-muted)' }}>→ due {labelOf(shift(d, -(parseInt(lead, 10) || 0)))} {due12h(dueTime)}</span></span>
              <button type="button" onClick={() => setDates((p) => p.filter((x) => x !== d))} aria-label={`Remove ${d}`} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
            </div>
          ))}
        </div>
      )}

      <UrgencySelect value={urgency} onChange={setUrgency} labelStyle={labelStyle} inputStyle={inputStyle} />
      <DesignerPicker designers={designers} selected={selected} setSelected={setSelected} />
      <div>
        <button type="submit" disabled={busy} style={{ ...primaryButtonStyle, opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Creating…' : `Create ${dates.length || ''} task${dates.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </form>
  );
}

function statusOf(a) {
  if (!a.submitted_at) return { text: 'Pending', color: 'var(--text-muted)' };
  if (a.is_late) return { text: `Submitted late · ${formatPkt(a.submitted_at)}`, color: '#f59e0b' };
  return { text: `Submitted · ${formatPkt(a.submitted_at)}`, color: 'var(--success)' };
}

export default function DesignersTab({ designers, tasks }) {
  const [mode, setMode] = useState('bulk');
  const [filter, setFilter] = useState('open');
  const shown = tasks.filter((t) => (filter === 'all' ? true : filter === 'done' ? t.assignees.every((a) => a.submitted_at) : t.assignees.some((a) => !a.submitted_at)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={cardStyle}>
        <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.1rem' }}>🎨 Designers tasks</h2>
        <p style={{ margin: '0 0 1.1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Assign work to the Graphics Designers. Use <strong>Bulk dates</strong> for one task that repeats on many dates: every date becomes its own task, due a few days before that date.
        </p>
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem' }}>
          {[['bulk', '🔁 Bulk dates (default task)'], ['single', '＋ Single task']].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setMode(id)} style={{ padding: '0.45rem 1rem', borderRadius: '2rem', fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer', border: '1px solid var(--primary)', color: mode === id ? 'white' : 'var(--primary)', backgroundColor: mode === id ? 'var(--primary)' : 'transparent' }}>{label}</button>
          ))}
        </div>
        {mode === 'bulk' ? <BulkForm designers={designers} /> : <SingleForm designers={designers} />}
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Designer tasks</h2>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {[['open', 'Open'], ['done', 'Completed'], ['all', 'All']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => setFilter(id)} style={{ padding: '0.3rem 0.9rem', borderRadius: '2rem', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', border: '1px solid var(--primary)', color: filter === id ? 'white' : 'var(--primary)', backgroundColor: filter === id ? 'var(--primary)' : 'transparent' }}>{label}</button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>No designer tasks here.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {shown.slice(0, 150).map((t) => (
              <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '1rem 1.25rem', backgroundColor: 'var(--card-bg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '0.92rem', whiteSpace: 'pre-wrap' }}><TaskBadges urgency={t.urgency} isDefault={false} />{t.task_text}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', textAlign: 'right' }}>Due {t.due_date} {due12h(t.due_time)}</div>
                </div>
                <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.4rem 1.25rem', flexWrap: 'wrap' }}>
                  {t.assignees.map((a) => {
                    const st = statusOf(a);
                    return <span key={a.id} style={{ fontSize: '0.78rem' }}><strong>{a.name}</strong> <span style={{ color: st.color, fontWeight: '600' }}>{st.text}</span></span>;
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
