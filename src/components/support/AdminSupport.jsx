'use client';

import { useState } from 'react';
import Link from 'next/link';
import UrgencySelect from '@/components/UrgencySelect';
import { forwardSupportTask, rejectSupportTask, approveSupportQuery, rejectSupportQuery } from '@/lib/supportActions';
import { TaskCard, QueryCard, ClientSelect, Tabs, ErrorText, useAction, useAutoRefresh, cardStyle, inputStyle, labelStyle, primaryBtn, ghostBtn, mutedStyle } from './shared';

// Tick one or several people.
function PeoplePicker({ legend, people, selected, onChange, roleLabels = {} }) {
  const all = people.length > 0 && selected.length === people.length;
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
      <legend style={labelStyle}>{legend}</legend>
      <div style={{ display: 'flex', gap: '0.5rem 1.1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {people.map((p) => (
          <label key={p.id} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.87rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={selected.includes(p.id)} onChange={(e) => onChange(e.target.checked ? [...selected, p.id] : selected.filter((id) => id !== p.id))} />
            {p.name}{roleLabels[p.role] && <span style={mutedStyle}>({roleLabels[p.role]})</span>}
          </label>
        ))}
        {people.length > 1 && (
          <button type="button" onClick={() => onChange(all ? [] : people.map((p) => p.id))} style={{ ...ghostBtn, padding: '0.2rem 0.7rem', fontSize: '0.75rem' }}>
            {all ? 'Clear' : 'Select all'}
          </button>
        )}
      </div>
    </fieldset>
  );
}

// "Reject" asks for a reason before it does anything.
function RejectControl({ onReject, busy }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  if (!open) return <button type="button" onClick={() => setOpen(true)} disabled={busy} style={{ ...ghostBtn, color: 'var(--danger)', borderColor: 'var(--danger)' }}>Reject</button>;
  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', flex: 1, minWidth: '260px' }}>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for rejecting" aria-label="Reason for rejecting" style={{ ...inputStyle, flex: 1, minWidth: '180px', width: 'auto' }} />
      <button type="button" onClick={() => onReject(note)} disabled={busy || !note.trim()} style={{ ...primaryBtn, backgroundColor: 'var(--danger)', opacity: busy || !note.trim() ? 0.6 : 1 }}>Confirm reject</button>
      <button type="button" onClick={() => setOpen(false)} disabled={busy} style={ghostBtn}>Cancel</button>
    </div>
  );
}

function ForwardForm({ task, managers, roleLabels, clients }) {
  const [clientName, setClientName] = useState(task.client_name || '');
  const [text, setText] = useState(task.task_text);
  const [dueDate, setDueDate] = useState(task.due_date);
  const [dueTime, setDueTime] = useState(task.due_time);
  const [urgency, setUrgency] = useState(task.urgency);
  const [selected, setSelected] = useState([]);
  const { busy, error, run } = useAction();

  return (
    <div style={{ marginTop: '0.9rem', paddingTop: '0.9rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      <ClientSelect id={`fwd-client-${task.id}`} clients={clients} value={clientName} onChange={setClientName} />
      <div>
        <label style={labelStyle} htmlFor={`fwd-text-${task.id}`}>Task as the managers will see it</label>
        <textarea id={`fwd-text-${task.id}`} value={text} onChange={(e) => setText(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.8rem' }}>
        <div>
          <label style={labelStyle} htmlFor={`fwd-date-${task.id}`}>Due date</label>
          <input id={`fwd-date-${task.id}`} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle} htmlFor={`fwd-time-${task.id}`}>Due time</label>
          <input id={`fwd-time-${task.id}`} type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} style={inputStyle} />
        </div>
        <UrgencySelect value={urgency} onChange={setUrgency} labelStyle={labelStyle} inputStyle={inputStyle} />
      </div>
      {managers.length === 0
        ? <div style={mutedStyle}>There is no active SEO or Web SEO manager to send this to.</div>
        : <PeoplePicker legend="Send to managers" people={managers} selected={selected} onChange={setSelected} roleLabels={roleLabels} />}
      <ErrorText error={error} />
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" disabled={busy || selected.length === 0} onClick={() => run(() => forwardSupportTask(task.id, { text, dueDate, dueTime, urgency, managerIds: selected, clientName }))}
          style={{ ...primaryBtn, opacity: busy || selected.length === 0 ? 0.6 : 1 }}>
          {busy ? 'Working…' : `Forward as task${selected.length ? ` (${selected.length})` : ''}`}
        </button>
        <RejectControl busy={busy} onReject={(note) => run(() => rejectSupportTask(task.id, note))} />
      </div>
    </div>
  );
}

function ApproveForm({ query, supportPeople, clients }) {
  const [clientName, setClientName] = useState(query.client_name || '');
  const [selected, setSelected] = useState([]);
  const { busy, error, run } = useAction();

  return (
    <div style={{ marginTop: '0.9rem', paddingTop: '0.9rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      <ClientSelect id={`apr-client-${query.id}`} clients={clients} value={clientName} onChange={setClientName} />
      {supportPeople.length === 0
        ? <div style={mutedStyle}>There is no support person yet. Add a user with the Support role on the <Link href="/admin/users" style={{ color: 'var(--primary)' }}>Users</Link> page.</div>
        : <PeoplePicker legend="Send to support" people={supportPeople} selected={selected} onChange={setSelected} />}
      <ErrorText error={error} />
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" disabled={busy || selected.length === 0} onClick={() => run(() => approveSupportQuery(query.id, selected, clientName))}
          style={{ ...primaryBtn, opacity: busy || selected.length === 0 ? 0.6 : 1 }}>
          {busy ? 'Working…' : `Approve and send${selected.length ? ` (${selected.length})` : ''}`}
        </button>
        <RejectControl busy={busy} onReject={(note) => run(() => rejectSupportQuery(query.id, note))} />
      </div>
    </div>
  );
}

function Section({ title, empty, children }) {
  return (
    <>
      <h2 style={{ fontSize: '1.05rem', margin: 0 }}>{title}</h2>
      {children.length ? children : <div style={cardStyle}><p style={{ margin: 0, color: 'var(--text-muted)' }}>{empty}</p></div>}
    </>
  );
}

export default function AdminSupport({ tasks, queries, managers, supportPeople, roleLabels, clients }) {
  useAutoRefresh();
  const pendingTasks = tasks.filter((t) => t.status === 'pending');
  const pendingQueries = queries.filter((q) => q.status === 'pending');
  const [tab, setTab] = useState(() => (pendingTasks.length === 0 && pendingQueries.length > 0 ? 'queries' : 'tasks'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '950px' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.35rem' }}>Support</h1>
        <p style={{ ...mutedStyle, fontSize: '0.875rem', margin: 0 }}>Forward Support&rsquo;s tasks to managers, and approve managers&rsquo; queries to Support. The numbers show what is waiting for you.</p>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'tasks', label: 'Tasks from Support', count: pendingTasks.length },
        { value: 'queries', label: 'Queries from Managers', count: pendingQueries.length },
      ]} />

      {tab === 'tasks' ? (
        <>
          <Section title="Waiting for you" empty="No task is waiting.">
            {pendingTasks.map((t) => <TaskCard key={t.id} task={t} showFrom><ForwardForm task={t} managers={managers} roleLabels={roleLabels} clients={clients} /></TaskCard>)}
          </Section>
          <Section title="Handled" empty="Nothing yet.">
            {tasks.filter((t) => t.status !== 'pending').map((t) => <TaskCard key={t.id} task={t} showFrom />)}
          </Section>
          <div style={mutedStyle}>Late submissions are approved on the <Link href="/admin/manager-tasks" style={{ color: 'var(--primary)' }}>Manager Tasks</Link> page, like any other manager task.</div>
        </>
      ) : (
        <>
          <Section title="Waiting for approval" empty="No query is waiting.">
            {pendingQueries.map((q) => <QueryCard key={q.id} query={q} showFrom><ApproveForm query={q} supportPeople={supportPeople} clients={clients} /></QueryCard>)}
          </Section>
          <Section title="Handled" empty="Nothing yet.">
            {queries.filter((q) => q.status !== 'pending').map((q) => <QueryCard key={q.id} query={q} showFrom />)}
          </Section>
        </>
      )}
    </div>
  );
}
