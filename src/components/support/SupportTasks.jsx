'use client';

import { useState } from 'react';
import UrgencySelect from '@/components/UrgencySelect';
import { DEFAULT_TASK_URGENCY } from '@/lib/taskUrgency';
import { createSupportTask } from '@/lib/supportActions';
import { TaskCard, ClientSelect, ErrorText, useAction, useAutoRefresh, cardStyle, inputStyle, labelStyle, primaryBtn, mutedStyle } from './shared';

// Support portal "Tasks to Tech": send a task to the admin and follow what happens to it.
export default function SupportTasks({ tasks, clients }) {
  useAutoRefresh();
  const [clientName, setClientName] = useState('');
  const [text, setText] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [urgency, setUrgency] = useState(DEFAULT_TASK_URGENCY);
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAction();

  const submit = (e) => {
    e.preventDefault();
    setSent(false);
    run(() => createSupportTask({ text, dueDate, dueTime, urgency, clientName }), () => {
      setClientName(''); setText(''); setDueDate(''); setDueTime(''); setUrgency(DEFAULT_TASK_URGENCY); setSent(true);
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '900px' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.35rem' }}>Tasks to Tech</h1>
        <p style={{ ...mutedStyle, fontSize: '0.875rem', margin: 0 }}>Your task goes to the admin, who forwards it to the managers. You can follow each manager&rsquo;s progress below.</p>
      </div>

      <form onSubmit={submit} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <ClientSelect id="support-task-client" clients={clients} value={clientName} onChange={setClientName} />
        <div>
          <label style={labelStyle} htmlFor="support-task-text">Task</label>
          <textarea id="support-task-text" value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="What needs to be done?" style={{ ...inputStyle, resize: 'vertical' }} required />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.9rem' }}>
          <div>
            <label style={labelStyle} htmlFor="support-due-date">Due date</label>
            <input id="support-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} required />
          </div>
          <div>
            <label style={labelStyle} htmlFor="support-due-time">Due time</label>
            <input id="support-due-time" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} style={inputStyle} required />
          </div>
          <UrgencySelect value={urgency} onChange={setUrgency} labelStyle={labelStyle} inputStyle={inputStyle} />
        </div>
        <ErrorText error={error} />
        {sent && <div style={{ color: 'var(--success)', fontSize: '0.85rem' }}>Sent to the admin.</div>}
        <div><button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Sending…' : 'Send task'}</button></div>
      </form>

      <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Your tasks ({tasks.length})</h2>
      {tasks.length === 0 ? (
        <div style={cardStyle}><p style={{ margin: 0, color: 'var(--text-muted)' }}>You have not sent any task yet.</p></div>
      ) : tasks.map((t) => <TaskCard key={t.id} task={t} />)}
    </div>
  );
}
