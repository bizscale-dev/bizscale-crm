'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import TaskBadges from '@/components/TaskBadges';
import { TASK_URGENCIES } from '@/lib/taskUrgency';
import {
  createManagerTask, approveTaskSubmission, rejectTaskSubmission,
  createRecurringTemplate, setRecurringTemplateActive, deleteRecurringTemplate, extendTaskDeadline,
  saveOnboardingChecklist, assignWebOnboarding,
} from './actions';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PAGE_SIZE = 15;

// weekdays is a single start-day number (stored as a string, plural name kept
// for DB compatibility with rows from before duration_days existed).
function formatTemplateSchedule(weekdays, durationDays) {
  const startDay = parseInt(String(weekdays).split(',')[0], 10);
  const startName = WEEKDAY_NAMES[startDay];
  if (!durationDays || durationDays <= 1) return `${startName} · due 12 AM`;
  const endName = WEEKDAY_NAMES[(startDay + durationDays - 1) % 7];
  return `${startName} through ${endName} · due 12 AM ${endName}`;
}

const URGENCY_COLOR = Object.fromEntries(TASK_URGENCIES.map((u) => [u.value, u.color]));

/* ---------- shared styles ---------- */

const labelStyle = {
  display: 'block', marginBottom: '0.4rem', fontSize: '0.72rem', fontWeight: '600',
  color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em',
};

const inputStyle = {
  width: '100%', padding: '0.6rem 0.85rem', borderRadius: '0.6rem', border: '1px solid var(--border)',
  backgroundColor: 'var(--background)', color: 'var(--foreground)', fontSize: '0.9rem',
  outline: 'none', fontFamily: 'inherit',
};

const primaryButtonStyle = {
  padding: '0.7rem 1.5rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none',
  borderRadius: '0.6rem', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem',
};

const ghostButtonStyle = {
  padding: '0.4rem 0.9rem', backgroundColor: 'transparent', color: 'var(--foreground)',
  border: '1px solid var(--border)', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem',
};

const smallButtonStyle = {
  padding: '0.4rem 0.9rem', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem',
};

const cardStyle = {
  backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '0.9rem', padding: '1.5rem',
};

/* ---------- helpers ---------- */

function groupManagersByRole(managers) {
  const groups = new Map();
  for (const m of managers) {
    if (!groups.has(m.role)) groups.set(m.role, []);
    groups.get(m.role).push(m);
  }
  return groups;
}

// A task's due moment, in the viewer's local time (default tasks are stored as 23:59).
const dueMoment = (task) => new Date(`${task.due_date}T${task.due_time || '23:59'}`);
const formatDue = (task) => {
  const d = new Date(`${task.due_date}T00:00:00`);
  const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} · ${task.template_id ? '12 AM' : task.due_time}`;
};

function taskStatus(task, now) {
  const total = task.assignees.length;
  const submitted = task.assignees.filter((a) => a.submitted_at).length;
  const needsReview = task.assignees.some((a) => a.is_late && a.approval_status === 'pending');
  const overdue = submitted < total && dueMoment(task) < now;
  const late = task.assignees.some((a) => a.is_late);
  return { total, submitted, needsReview, late, overdue, done: submitted === total };
}

/* ---------- small UI pieces ---------- */

function StatTile({ label, value, color, hint }) {
  return (
    <div style={{ ...cardStyle, padding: '1rem 1.15rem', borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: '1.65rem', fontWeight: '700', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: '0.78rem', fontWeight: '600', marginTop: '0.25rem' }}>{label}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{hint}</div>
    </div>
  );
}

function Pill({ children, color, solid }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', fontWeight: '600',
      padding: '0.15rem 0.6rem', borderRadius: '1rem', whiteSpace: 'nowrap',
      color: solid ? 'white' : color, backgroundColor: solid ? color : 'transparent', border: `1px solid ${color}`,
    }}>
      {children}
    </span>
  );
}

function Message({ message }) {
  if (!message) return null;
  const error = message.type === 'error';
  return (
    <div style={{
      padding: '0.75rem 1rem', borderRadius: '0.6rem', marginBottom: '1rem', fontSize: '0.875rem',
      backgroundColor: error ? 'rgba(220, 38, 38, 0.1)' : 'rgba(22, 178, 147, 0.1)',
      color: error ? 'var(--danger)' : 'var(--success)',
    }}>
      {message.text}
    </div>
  );
}

function Empty({ icon, title, text }) {
  return (
    <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{icon}</div>
      <div style={{ fontWeight: '600', color: 'var(--foreground)', marginBottom: '0.25rem' }}>{title}</div>
      <div style={{ fontSize: '0.85rem' }}>{text}</div>
    </div>
  );
}

function UrgencyPicker({ value, onChange }) {
  return (
    <div>
      <label style={labelStyle}>Urgency</label>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {TASK_URGENCIES.map((u) => {
          const active = value === u.value;
          return (
            <button key={u.value} type="button" onClick={() => onChange(u.value)} style={{
              padding: '0.5rem 1.1rem', borderRadius: '0.6rem', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem',
              border: `1.5px solid ${active ? u.color : 'var(--border)'}`,
              backgroundColor: active ? u.color : 'transparent',
              color: active ? 'white' : 'var(--foreground)',
            }}>
              {u.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Pick managers as chips, grouped by role, with a select-all per group.
function ManagerPicker({ managers, roleLabels, selectedIds, setSelectedIds }) {
  const byRole = groupManagersByRole(managers);
  const toggle = (id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleGroup = (ids) => setSelectedIds((prev) => {
    const all = ids.every((id) => prev.includes(id));
    return all ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])];
  });

  return (
    <div>
      <label style={labelStyle}>Assign to {selectedIds.length > 0 && `· ${selectedIds.length} selected`}</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        {[...byRole.entries()].map(([role, list]) => {
          const ids = list.map((m) => m.id);
          const allOn = ids.every((id) => selectedIds.includes(id));
          return (
            <div key={role}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.45rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)' }}>{roleLabels[role] || role}</span>
                <button type="button" onClick={() => toggleGroup(ids)} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}>
                  {allOn ? 'Clear' : 'Select all'}
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {list.map((m) => {
                  const on = selectedIds.includes(m.id);
                  return (
                    <button key={m.id} type="button" onClick={() => toggle(m.id)} style={{
                      padding: '0.4rem 0.9rem', borderRadius: '2rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500',
                      border: `1.5px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
                      backgroundColor: on ? 'var(--primary)' : 'transparent',
                      color: on ? 'white' : 'var(--foreground)',
                    }}>
                      {on ? '✓ ' : ''}{m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {managers.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No active managers found.</p>}
      </div>
    </div>
  );
}

const REVIEW_LABELS = {
  pending: { text: 'Late — needs your review', color: '#f59e0b' },
  approved: { text: 'Late — approved', color: 'var(--success)' },
  rejected: { text: 'Late — rejected', color: 'var(--danger)' },
};

function AssigneeStatus({ assignee }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState(null);
  const submitted = !!assignee.submitted_at;
  const isLate = !!assignee.is_late;
  const pendingReview = isLate && assignee.approval_status === 'pending';

  const handleReview = async (decision) => {
    setReviewError(null);
    setReviewing(true);
    const action = decision === 'approved' ? approveTaskSubmission : rejectTaskSubmission;
    const result = await action(assignee.id);
    setReviewing(false);
    if (result?.error) { setReviewError(result.error); return; }
    router.refresh();
  };

  const statusColor = !submitted ? 'var(--text-muted)'
    : isLate ? (REVIEW_LABELS[assignee.approval_status]?.color || '#f59e0b') : 'var(--success)';
  const statusText = !submitted ? 'Pending'
    : isLate ? (REVIEW_LABELS[assignee.approval_status]?.text || REVIEW_LABELS.pending.text)
      : `Submitted ${new Date(assignee.submitted_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;

  return (
    <div style={{
      border: `1px solid ${pendingReview ? '#f59e0b' : 'var(--border)'}`, borderRadius: '0.6rem',
      padding: '0.6rem 0.85rem', backgroundColor: 'var(--background)',
    }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', cursor: submitted ? 'pointer' : 'default' }}
        onClick={() => submitted && setExpanded((e) => !e)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
          <span style={{
            width: '1.7rem', height: '1.7rem', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', fontWeight: '700', color: 'white', backgroundColor: submitted ? 'var(--primary)' : 'var(--text-muted)',
          }}>
            {assignee.name?.[0]?.toUpperCase()}
          </span>
          <span style={{ fontWeight: '600', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assignee.name}</span>
        </div>
        <span style={{ fontSize: '0.75rem', fontWeight: '600', color: statusColor, whiteSpace: 'nowrap' }}>
          {submitted ? '● ' : '○ '}{statusText}{submitted ? (expanded ? ' ▴' : ' ▾') : ''}
        </span>
      </div>

      {submitted && expanded && (
        <div style={{ marginTop: '0.7rem', paddingTop: '0.7rem', borderTop: '1px solid var(--border)' }}>
          {isLate && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
              Submitted late: {new Date(assignee.submitted_at).toLocaleString()}
              {assignee.late_reason && <><br />Reason: {assignee.late_reason}</>}
            </div>
          )}
          <div style={{ fontSize: '0.85rem', marginBottom: '0.6rem', whiteSpace: 'pre-wrap' }}>{assignee.submission_description}</div>
          {assignee.proof_image_base64 && (
            <img src={assignee.proof_image_base64} alt="Proof"
              style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '0.5rem', border: '1px solid var(--border)', marginBottom: pendingReview ? '0.7rem' : 0 }} />
          )}
          {pendingReview && (
            <div onClick={(e) => e.stopPropagation()}>
              {reviewError && <div style={{ fontSize: '0.8rem', color: 'var(--danger)', marginBottom: '0.5rem' }}>{reviewError}</div>}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" disabled={reviewing} onClick={() => handleReview('approved')}
                  style={{ ...smallButtonStyle, backgroundColor: 'var(--success)', color: 'white', opacity: reviewing ? 0.6 : 1 }}>Approve</button>
                <button type="button" disabled={reviewing} onClick={() => handleReview('rejected')}
                  style={{ ...smallButtonStyle, backgroundColor: 'var(--danger)', color: 'white', opacity: reviewing ? 0.6 : 1 }}>Reject</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function parseList(v) {
  try {
    const a = JSON.parse(v || '[]');
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

// One task with who it went to and how far along each person is.
function TaskCard({ task, now, compact, kind = 'manager' }) {
  const router = useRouter();
  const st = taskStatus(task, now);
  const [extending, setExtending] = useState(false);
  const [newDate, setNewDate] = useState(task.due_date);
  const [newTime, setNewTime] = useState(task.due_time || '23:59');
  const [saving, setSaving] = useState(false);
  const [extendError, setExtendError] = useState(null);

  const saveExtension = async () => {
    setSaving(true);
    setExtendError(null);
    const result = await extendTaskDeadline(kind, task.id, newDate, newTime);
    setSaving(false);
    if (result?.error) { setExtendError(result.error); return; }
    setExtending(false);
    router.refresh();
  };
  const items = parseList(task.checklist);
  const tickedBy = (i) => task.assignees.every((a) => parseList(a.checklist_done).includes(i));
  const stripe = URGENCY_COLOR[task.urgency] || URGENCY_COLOR.moderate;
  return (
    <div style={{
      border: '1px solid var(--border)', borderLeft: `4px solid ${stripe}`, borderRadius: '0.75rem',
      padding: compact ? '0.9rem 1rem' : '1.1rem 1.25rem', backgroundColor: 'var(--card-bg)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', fontSize: compact ? '0.875rem' : '0.95rem', whiteSpace: 'pre-wrap' }}>
          <TaskBadges urgency={task.urgency} isDefault={!!(task.template_id || task.is_default)} />
          {task.task_text}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {st.needsReview && <Pill color="#f59e0b" solid>Needs review</Pill>}
          {st.done ? <Pill color="var(--success)">Completed</Pill>
            : st.overdue ? <Pill color="var(--danger)">Overdue</Pill> : null}
          <Pill color="var(--text-muted)">Due {formatDue(task)}</Pill>
          <button type="button" onClick={() => setExtending((v) => !v)} style={{ ...ghostButtonStyle, padding: '0.15rem 0.7rem', fontSize: '0.72rem', borderRadius: '1rem' }}>
            {extending ? 'Cancel' : '⏱ Extend'}
          </button>
          {task.assignees.length > 1 && <Pill color="var(--text-muted)">{st.submitted}/{st.total} submitted</Pill>}
        </div>
      </div>
      {extending && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '0.75rem', marginBottom: '0.75rem', padding: '0.75rem', border: '1px dashed var(--border)', borderRadius: '0.6rem' }}>
          <div>
            <label style={labelStyle}>New due date</label>
            <input type="date" value={newDate} min={task.due_date} onChange={(e) => setNewDate(e.target.value)} onClick={(e) => e.target.showPicker?.()} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }} />
          </div>
          <div>
            <label style={labelStyle}>New due time</label>
            <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} onClick={(e) => e.target.showPicker?.()} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }} />
          </div>
          <button type="button" disabled={saving} onClick={saveExtension} style={{ ...primaryButtonStyle, padding: '0.6rem 1.2rem', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Extend deadline'}
          </button>
          {extendError && <div style={{ fontSize: '0.8rem', color: 'var(--danger)', flexBasis: '100%' }}>{extendError}</div>}
        </div>
      )}
      {items.length > 0 && (
        <details style={{ marginBottom: '0.75rem', fontSize: '0.85rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: '600', color: 'var(--text-muted)' }}>
            Checklist · {task.assignees.map((a) => `${a.name}: ${parseList(a.checklist_done).length}/${items.length}`).join(' · ')}
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.5rem' }}>
            {items.map((item, i) => (
              <div key={i} style={{ color: tickedBy(i) ? 'var(--success)' : 'inherit' }}>{tickedBy(i) ? '☑' : '☐'} {item}</div>
            ))}
          </div>
        </details>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '0.5rem' }}>
        {task.assignees.map((a) => <AssigneeStatus key={a.id} assignee={a} />)}
      </div>
    </div>
  );
}

/* ---------- Tab: all assigned tasks ---------- */

function TasksTab({ tasks, managers }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [urgency, setUrgency] = useState('all');
  const [managerId, setManagerId] = useState('all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const now = useMemo(() => new Date(), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (q && !t.task_text.toLowerCase().includes(q) && !t.assignees.some((a) => a.name.toLowerCase().includes(q))) return false;
      if (urgency !== 'all' && (t.urgency || 'moderate') !== urgency) return false;
      if (managerId !== 'all' && !t.assignees.some((a) => a.user_id === parseInt(managerId, 10))) return false;
      const st = taskStatus(t, now);
      if (status === 'late') return st.late;
      if (status === 'review') return st.needsReview;
      if (status === 'overdue') return st.overdue;
      if (status === 'pending') return !st.done;
      if (status === 'done') return st.done;
      return true;
    });
  }, [tasks, search, status, urgency, managerId, now]);

  const reset = (setter) => (e) => { setter(e.target.value); setLimit(PAGE_SIZE); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ ...cardStyle, padding: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
        <input value={search} onChange={reset(setSearch)} placeholder="🔍 Search task or manager…" style={{ ...inputStyle, gridColumn: 'span 2' }} />
        <select value={status} onChange={reset(setStatus)} style={inputStyle}>
          <option value="all">All statuses</option>
          <option value="late">Late submissions</option>
          <option value="review">Needs review</option>
          <option value="overdue">Overdue</option>
          <option value="pending">Not completed</option>
          <option value="done">Completed</option>
        </select>
        <select value={urgency} onChange={reset(setUrgency)} style={inputStyle}>
          <option value="all">Any urgency</option>
          {TASK_URGENCIES.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
        </select>
        <select value={managerId} onChange={reset(setManagerId)} style={inputStyle}>
          <option value="all">All managers</option>
          {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        Showing {Math.min(limit, filtered.length)} of {filtered.length} task{filtered.length === 1 ? '' : 's'}
      </div>

      {filtered.length === 0 ? (
        <div style={cardStyle}><Empty icon="📭" title="No tasks match" text="Try clearing a filter, or assign a new task." /></div>
      ) : (
        <>
          {filtered.slice(0, limit).map((t) => <TaskCard key={t.id} task={t} now={now} />)}
          {filtered.length > limit && (
            <button type="button" onClick={() => setLimit((l) => l + PAGE_SIZE)} style={{ ...ghostButtonStyle, alignSelf: 'center', padding: '0.6rem 1.5rem' }}>
              Show {Math.min(PAGE_SIZE, filtered.length - limit)} more
            </button>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- Tab: assign a one-off task ---------- */

function AssignTab({ managers, roleLabels }) {
  const router = useRouter();
  const [taskText, setTaskText] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [urgency, setUrgency] = useState('moderate');
  const [selectedIds, setSelectedIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const formData = new FormData();
    formData.set('task_text', taskText);
    formData.set('due_date', dueDate);
    formData.set('due_time', dueTime);
    formData.set('urgency', urgency);
    selectedIds.forEach((id) => formData.append('assignee_ids', id));
    const result = await createManagerTask(formData);
    setSubmitting(false);
    if (result?.error) { setMessage({ type: 'error', text: result.error }); return; }
    setMessage({ type: 'success', text: `Task assigned to ${result.assignedCount} manager(s).` });
    setTaskText(''); setDueDate(''); setDueTime(''); setUrgency('moderate'); setSelectedIds([]);
    router.refresh();
  };

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>Assign a new task</h2>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>One-off task with its own deadline. Managers are notified straight away.</p>
      <Message message={message} />
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>What needs to be done?</label>
          <textarea value={taskText} onChange={(e) => setTaskText(e.target.value)} rows={3}
            style={{ ...inputStyle, resize: 'vertical' }} placeholder="Describe the task…" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              onClick={(e) => e.target.showPicker?.()} style={{ ...inputStyle, cursor: 'pointer' }} />
          </div>
          <div>
            <label style={labelStyle}>Due time</label>
            <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)}
              onClick={(e) => e.target.showPicker?.()} style={{ ...inputStyle, cursor: 'pointer' }} />
          </div>
        </div>
        <UrgencyPicker value={urgency} onChange={setUrgency} />
        <ManagerPicker managers={managers} roleLabels={roleLabels} selectedIds={selectedIds} setSelectedIds={setSelectedIds} />
        <div>
          <button type="submit" disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Assigning…' : 'Assign task'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------- Tab: default (weekly) tasks ---------- */

function DefaultTab({ managers, roleLabels, templates }) {
  const router = useRouter();
  const [taskText, setTaskText] = useState('');
  const [startWeekday, setStartWeekday] = useState('');
  const [durationDays, setDurationDays] = useState(1);
  const [urgency, setUrgency] = useState('moderate');
  const [selectedIds, setSelectedIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const endDayLabel = startWeekday !== '' && durationDays > 1
    ? WEEKDAY_NAMES[(parseInt(startWeekday, 10) + durationDays - 1) % 7] : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const formData = new FormData();
    formData.set('task_text', taskText);
    formData.set('start_weekday', startWeekday);
    formData.set('duration_days', durationDays);
    formData.set('urgency', urgency);
    selectedIds.forEach((id) => formData.append('assignee_ids', id));
    const result = await createRecurringTemplate(formData);
    setSubmitting(false);
    if (result?.error) { setMessage({ type: 'error', text: result.error }); return; }
    const startName = WEEKDAY_NAMES[parseInt(startWeekday, 10)];
    const span = durationDays > 1 ? ` through ${endDayLabel}` : '';
    setMessage({ type: 'success', text: `Default task created — repeats every ${startName}${span} for ${result.assignedCount} manager(s).` });
    setTaskText(''); setStartWeekday(''); setDurationDays(1); setUrgency('moderate'); setSelectedIds([]);
    router.refresh();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={cardStyle}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>New default task</h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
          Repeats every week on the start day. For work that takes longer, set a duration — it stays due until 12 AM on the last day.
        </p>
        <Message message={message} />
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={labelStyle}>Task</label>
            <textarea value={taskText} onChange={(e) => setTaskText(e.target.value)} rows={2}
              style={{ ...inputStyle, resize: 'vertical' }} placeholder="Describe the recurring task…" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>Start day</label>
              <select value={startWeekday} onChange={(e) => setStartWeekday(e.target.value)} style={inputStyle}>
                <option value="">Select a day…</option>
                {WEEKDAY_NAMES.map((name, d) => <option key={d} value={d}>{name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Duration (days)</label>
              <input type="number" min={1} max={7} value={durationDays}
                onChange={(e) => setDurationDays(Math.min(7, Math.max(1, parseInt(e.target.value, 10) || 1)))} style={inputStyle} />
              {endDayLabel && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>Due {endDayLabel} at 12 AM</div>}
            </div>
          </div>
          <UrgencyPicker value={urgency} onChange={setUrgency} />
          <ManagerPicker managers={managers} roleLabels={roleLabels} selectedIds={selectedIds} setSelectedIds={setSelectedIds} />
          <div>
            <button type="submit" disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Creating…' : 'Create default task'}
            </button>
          </div>
        </form>
      </div>

      <div style={cardStyle}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Default tasks ({templates.length})</h2>
        {templates.length === 0 ? (
          <Empty icon="🔁" title="No default tasks yet" text="Create one above and it will repeat every week." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {templates.map((t) => (
              <div key={t.id} style={{
                border: '1px solid var(--border)', borderLeft: `4px solid ${URGENCY_COLOR[t.urgency] || URGENCY_COLOR.moderate}`, borderRadius: '0.7rem',
                padding: '0.9rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
                opacity: t.is_active ? 1 : 0.55,
              }}>
                <div style={{ flex: '1 1 260px' }}>
                  <div style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}><TaskBadges urgency={t.urgency} isDefault={false} />{t.task_text}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    Every {formatTemplateSchedule(t.weekdays, t.duration_days)} · {t.assignee_names || 'no managers'}{t.is_active ? '' : ' · paused'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" style={ghostButtonStyle}
                    onClick={async () => { await setRecurringTemplateActive(t.id, !t.is_active); router.refresh(); }}>
                    {t.is_active ? 'Pause' : 'Resume'}
                  </button>
                  <button type="button" style={{ ...smallButtonStyle, backgroundColor: 'var(--danger)', color: 'white' }}
                    onClick={async () => { if (confirm('Delete this default task? Already-created occurrences are kept.')) { await deleteRecurringTemplate(t.id); router.refresh(); } }}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Tab: per-manager check & balance ---------- */

function BalanceTab({ managers, tasks, associateTasks }) {
  const [selectedId, setSelectedId] = useState('');
  const now = useMemo(() => new Date(), []);
  const selectedManagerId = selectedId === '' ? null : parseInt(selectedId, 10);
  const selectedManager = managers.find((m) => m.id === selectedManagerId);

  const down = selectedManagerId
    ? tasks.filter((t) => t.assignees.some((a) => a.user_id === selectedManagerId))
      .map((t) => ({ ...t, assignees: t.assignees.filter((a) => a.user_id === selectedManagerId) }))
    : [];
  const up = selectedManagerId ? associateTasks.filter((t) => t.manager_id === selectedManagerId) : [];

  const section = (title, list, emptyText, kind) => (
    <div>
      <h3 style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>{title} <span style={{ color: 'var(--text-muted)', fontWeight: '500' }}>({list.length})</span></h3>
      {list.length === 0
        ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{emptyText}</p>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>{list.map((t) => <TaskCard key={t.id} task={t} now={now} compact kind={kind} />)}</div>}
    </div>
  );

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>Manager check & balance</h2>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
        Pick a manager to see what you assigned them and what they assigned on to their own associates.
      </p>
      <div style={{ marginBottom: '1.5rem', maxWidth: '360px' }}>
        <label style={labelStyle}>Manager</label>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={inputStyle}>
          <option value="">Select a manager…</option>
          {[...groupManagersByRole(managers).entries()].map(([role, list]) => (
            <optgroup key={role} label={list[0]?.roleLabel || role}>
              {list.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      {selectedManager ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {section(`Admin → ${selectedManager.name}`, down, 'Nothing assigned to them yet.', 'manager')}
          {section(`${selectedManager.name} → their associates`, up, "They haven't assigned anything to their associates yet.", 'associate')}
        </div>
      ) : (
        <Empty icon="🔍" title="Choose a manager" text="Both directions of work will show up here." />
      )}
    </div>
  );
}

/* ---------- Tab: onboarding checklists ---------- */

// Edit one onboarding checklist: sections (title + due working days) and the
// items in each. Saved checklists only apply to tasks created afterwards.
function ChecklistEditor({ keyName, template, children }) {
  const router = useRouter();
  const [sections, setSections] = useState(() => template.sections.map((s) => ({ ...s, items: [...s.items] })));
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const update = (si, patch) => setSections((prev) => prev.map((s, i) => (i === si ? { ...s, ...patch } : s)));
  const removeItem = (si, ii) => update(si, { items: sections[si].items.filter((_, i) => i !== ii) });
  const addItem = (si) => {
    const text = (drafts[si] || '').trim();
    if (!text) return;
    update(si, { items: [...sections[si].items, text] });
    setDrafts((d) => ({ ...d, [si]: '' }));
  };
  const addSection = () => setSections((prev) => [...prev, { title: 'New section', due_days: 2, items: [] }]);
  const removeSection = (si) => setSections((prev) => prev.filter((_, i) => i !== si));

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const result = await saveOnboardingChecklist(keyName, sections);
    setSaving(false);
    if (result?.error) { setMessage({ type: 'error', text: result.error }); return; }
    setMessage({ type: 'success', text: 'Checklist saved — it applies to tasks created from now on.' });
    router.refresh();
  };

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>{template.name}</h2>
      {children}
      <Message message={message} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {sections.map((s, si) => (
          <div key={si} style={{ border: '1px solid var(--border)', borderRadius: '0.7rem', padding: '1rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
              {(sections.length > 1 || keyName === 'web') && (
                <div style={{ flex: '1 1 220px' }}>
                  <label style={labelStyle}>Section</label>
                  <input value={s.title} onChange={(e) => update(si, { title: e.target.value })} style={inputStyle} />
                </div>
              )}
              <div style={{ width: '150px' }}>
                <label style={labelStyle}>Due (working days)</label>
                <input type="number" min={1} max={60} value={s.due_days}
                  onChange={(e) => update(si, { due_days: Math.min(60, Math.max(1, parseInt(e.target.value, 10) || 1)) })} style={inputStyle} />
              </div>
              {sections.length > 1 && (
                <button type="button" onClick={() => { if (confirm(`Remove the "${s.title}" section?`)) removeSection(si); }}
                  style={{ ...smallButtonStyle, backgroundColor: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
                  Remove section
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.75rem' }}>
              {s.items.map((item, ii) => (
                <div key={ii} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.875rem', padding: '0.3rem 0.6rem', borderRadius: '0.4rem', backgroundColor: 'var(--background)' }}>
                  <span style={{ flex: 1 }}>☐ {item}</span>
                  <button type="button" onClick={() => removeItem(si, ii)} title="Remove item"
                    style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>×</button>
                </div>
              ))}
              {s.items.length === 0 && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No items yet.</div>}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input value={drafts[si] || ''} placeholder="Add an item…" style={inputStyle}
                onChange={(e) => setDrafts((d) => ({ ...d, [si]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(si); } }} />
              <button type="button" onClick={() => addItem(si)} style={{ ...ghostButtonStyle, whiteSpace: 'nowrap' }}>＋ Add</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={addSection} style={ghostButtonStyle}>＋ Add section</button>
        <button type="button" onClick={save} disabled={saving} style={{ ...primaryButtonStyle, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save checklist'}
        </button>
      </div>
    </div>
  );
}

function WebOnboardingAssign({ webManagers }) {
  const router = useRouter();
  const [managerId, setManagerId] = useState('');
  const [clientName, setClientName] = useState('');
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const formData = new FormData();
    formData.set('manager_id', managerId);
    formData.set('client_name', clientName);
    formData.set('website', website);
    const result = await assignWebOnboarding(formData);
    setSubmitting(false);
    if (result?.error) { setMessage({ type: 'error', text: result.error }); return; }
    setMessage({ type: 'success', text: `Assigned — ${result.taskCount} checklist task(s) created.` });
    setClientName(''); setWebsite('');
    router.refresh();
  };

  return (
    <form onSubmit={submit} style={{ border: '1px solid var(--border)', borderRadius: '0.7rem', padding: '1rem', margin: '0.75rem 0 1.25rem' }}>
      <div style={{ fontWeight: '600', fontSize: '0.9rem', marginBottom: '0.75rem' }}>Assign to a client</div>
      <Message message={message} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '0.9rem' }}>
        <div>
          <label style={labelStyle}>Manager</label>
          <select value={managerId} onChange={(e) => setManagerId(e.target.value)} style={inputStyle}>
            <option value="">Select a manager…</option>
            {webManagers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Client name</label>
          <input value={clientName} onChange={(e) => setClientName(e.target.value)} style={inputStyle} placeholder="e.g. Acme Roofing" />
        </div>
        <div>
          <label style={labelStyle}>Website</label>
          <input value={website} onChange={(e) => setWebsite(e.target.value)} style={inputStyle} placeholder="e.g. acmeroofing.com" />
        </div>
      </div>
      <button type="submit" disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1 }}>
        {submitting ? 'Assigning…' : 'Assign web onboarding task'}
      </button>
    </form>
  );
}

function OnboardingTab({ templates, webManagers }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <ChecklistEditor keyName="gbp" template={templates.gbp}>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Created automatically for every new SEO client (daily check at 4 PM) and assigned to Talha or M Hussain by the client&apos;s Support number.
        </p>
      </ChecklistEditor>
      <ChecklistEditor keyName="web" template={templates.web}>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
          You assign this one yourself. Each section becomes its own checklist task with its own due date (working days).
        </p>
        <WebOnboardingAssign webManagers={webManagers} />
      </ChecklistEditor>
    </div>
  );
}

/* ---------- page ---------- */

const TABS = [
  { id: 'tasks', label: 'All tasks' },
  { id: 'assign', label: '＋ Assign task' },
  { id: 'default', label: '🔁 Default tasks' },
  { id: 'onboarding', label: '🧭 Onboarding' },
  { id: 'balance', label: '🔍 Check & balance' },
];

export default function ManagerTasksClient({ managers, tasks, roleLabels, templates = [], associateTasks = [], onboardingTemplates, webManagers = [] }) {
  const [tab, setTab] = useState('tasks');
  const now = useMemo(() => new Date(), []);

  const stats = useMemo(() => {
    let open = 0, overdue = 0, review = 0, late = 0, done = 0;
    for (const t of tasks) {
      const st = taskStatus(t, now);
      if (st.done) done++; else open++;
      if (st.overdue) overdue++;
      if (st.needsReview) review++;
      if (st.late) late++;
    }
    return { open, overdue, review, late, done };
  }, [tasks, now]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Manager tasks</h1>
        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>Assign work to managers, track submissions and review late ones.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.9rem' }}>
        <StatTile label="Open" value={stats.open} color="var(--primary)" hint="not fully submitted" />
        <StatTile label="Overdue" value={stats.overdue} color="var(--danger)" hint="past their deadline" />
        <StatTile label="Late submissions" value={stats.late} color="#f97316" hint="submitted after the deadline" />
        <StatTile label="Needs review" value={stats.review} color="#f59e0b" hint="late ones waiting for you" />
        <StatTile label="Completed" value={stats.done} color="var(--success)" hint="everyone submitted" />
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} style={{
              padding: '0.55rem 1.1rem', borderRadius: '2rem', cursor: 'pointer', fontSize: '0.88rem', fontWeight: '600',
              border: '1px solid ' + (active ? 'var(--primary)' : 'transparent'),
              backgroundColor: active ? 'var(--primary)' : 'transparent',
              color: active ? 'white' : 'var(--text-muted)',
            }}>
              {t.label}{t.id === 'tasks' && stats.review > 0 ? ` · ${stats.review} to review` : ''}
            </button>
          );
        })}
      </div>

      {tab === 'tasks' && <TasksTab tasks={tasks} managers={managers} />}
      {tab === 'assign' && <AssignTab managers={managers} roleLabels={roleLabels} />}
      {tab === 'default' && <DefaultTab managers={managers} roleLabels={roleLabels} templates={templates} />}
      {tab === 'onboarding' && <OnboardingTab templates={onboardingTemplates} webManagers={webManagers} />}
      {tab === 'balance' && <BalanceTab managers={managers} tasks={tasks} associateTasks={associateTasks} />}
    </div>
  );
}
