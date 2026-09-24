'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createManagerTask, approveTaskSubmission, rejectTaskSubmission,
  createRecurringTemplate, setRecurringTemplateActive, deleteRecurringTemplate,
} from './actions';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const BRAND_COLOR = 'var(--primary)';

const labelStyle = {
  display: 'block',
  marginBottom: '0.4rem',
  fontSize: '0.75rem',
  fontWeight: '600',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
};

const inputStyle = {
  width: '100%',
  padding: '0.6rem 0.85rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: '0.9rem',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const primaryButtonStyle = {
  padding: '0.65rem 1.35rem',
  backgroundColor: BRAND_COLOR,
  color: 'white',
  border: 'none',
  borderRadius: '0.5rem',
  cursor: 'pointer',
  fontWeight: '600',
  fontSize: '0.875rem',
};

const cardStyle = {
  backgroundColor: 'var(--card-bg)',
  border: '1px solid var(--border)',
  borderRadius: '0.75rem',
  padding: '1.5rem',
};

function groupManagersByRole(managers) {
  const groups = new Map();
  for (const m of managers) {
    if (!groups.has(m.role)) groups.set(m.role, []);
    groups.get(m.role).push(m);
  }
  return groups;
}

const REVIEW_LABELS = {
  pending: { text: '🟠 Late — pending your review', color: '#f59e0b' },
  approved: { text: '✅ Late — approved', color: 'var(--success)' },
  rejected: { text: '❌ Late — rejected', color: 'var(--danger)' },
};

const smallButtonStyle = {
  padding: '0.4rem 0.9rem',
  border: 'none',
  borderRadius: '0.4rem',
  cursor: 'pointer',
  fontWeight: '600',
  fontSize: '0.8rem',
};

function AssigneeStatus({ assignee }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState(null);
  const submitted = !!assignee.submitted_at;
  const isLate = !!assignee.is_late;

  const handleReview = async (decision) => {
    setReviewError(null);
    setReviewing(true);
    const action = decision === 'approved' ? approveTaskSubmission : rejectTaskSubmission;
    const result = await action(assignee.id);
    setReviewing(false);
    if (result?.error) {
      setReviewError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: '0.5rem',
      padding: '0.75rem 1rem',
      backgroundColor: 'var(--background)',
    }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: submitted ? 'pointer' : 'default' }}
        onClick={() => submitted && setExpanded((e) => !e)}
      >
        <div>
          <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{assignee.name}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{assignee.role}</div>
        </div>
        {submitted ? (
          <span style={{ fontSize: '0.8rem', fontWeight: '600', color: isLate ? (REVIEW_LABELS[assignee.approval_status]?.color || '#f59e0b') : 'var(--success)' }}>
            {isLate
              ? (REVIEW_LABELS[assignee.approval_status]?.text || REVIEW_LABELS.pending.text)
              : `✅ Submitted ${new Date(assignee.submitted_at).toLocaleString()}`}
          </span>
        ) : (
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600' }}>
            ⏳ Pending
          </span>
        )}
      </div>

      {submitted && expanded && (
        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
          {isLate && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Submitted late: {new Date(assignee.submitted_at).toLocaleString()}
              {assignee.late_reason && <><br />Reason: {assignee.late_reason}</>}
            </div>
          )}
          <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem', whiteSpace: 'pre-wrap' }}>
            {assignee.submission_description}
          </div>
          {assignee.proof_image_base64 && (
            <img
              src={assignee.proof_image_base64}
              alt="Proof"
              style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '0.5rem', border: '1px solid var(--border)', marginBottom: isLate && assignee.approval_status === 'pending' ? '0.75rem' : 0 }}
            />
          )}
          {isLate && assignee.approval_status === 'pending' && (
            <div onClick={(e) => e.stopPropagation()}>
              {reviewError && <div style={{ fontSize: '0.8rem', color: 'var(--danger)', marginBottom: '0.5rem' }}>{reviewError}</div>}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  disabled={reviewing}
                  onClick={() => handleReview('approved')}
                  style={{ ...smallButtonStyle, backgroundColor: 'var(--success)', color: 'white', opacity: reviewing ? 0.6 : 1 }}
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={reviewing}
                  onClick={() => handleReview('rejected')}
                  style={{ ...smallButtonStyle, backgroundColor: 'var(--danger)', color: 'white', opacity: reviewing ? 0.6 : 1 }}
                >
                  Reject
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Separate "Default Tasks" portion: a task tied to ONE weekday (no date), which
// repeats every week — it appears on that day and is due by 12 AM (end of that
// day). Distinct from the one-off form below, which takes a specific date/time.
function DefaultTasksSection({ managers, roleLabels, templates }) {
  const router = useRouter();
  const [taskText, setTaskText] = useState('');
  const [weekday, setWeekday] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const managersByRole = groupManagersByRole(managers);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const formData = new FormData();
    formData.set('task_text', taskText);
    if (weekday !== '') formData.append('weekdays', weekday);
    selectedIds.forEach((id) => formData.append('assignee_ids', id));
    const result = await createRecurringTemplate(formData);
    setSubmitting(false);
    if (result?.error) {
      setMessage({ type: 'error', text: result.error });
      return;
    }
    setMessage({ type: 'success', text: `Default task created — repeats every ${WEEKDAY_NAMES[parseInt(weekday, 10)]} for ${result.assignedCount} manager(s).` });
    setTaskText('');
    setWeekday('');
    setSelectedIds([]);
    router.refresh();
  };

  return (
    <div style={cardStyle}>
      <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.1rem' }}>🔁 Default Tasks (weekly)</h2>
      <p style={{ margin: '0 0 1.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        Pick one day of the week — no date needed. The task appears for the managers every week on that day and is due by 12 AM (end of that day).
      </p>

      {message && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.875rem',
          backgroundColor: message.type === 'error' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(22, 178, 147, 0.1)',
          color: message.type === 'error' ? 'var(--danger)' : 'var(--success)',
        }}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label style={labelStyle}>Task</label>
          <textarea value={taskText} onChange={(e) => setTaskText(e.target.value)} rows={2}
            style={{ ...inputStyle, resize: 'vertical' }} placeholder="Describe the recurring task..." />
        </div>
        <div>
          <label style={labelStyle}>Day of the week</label>
          <select value={weekday} onChange={(e) => setWeekday(e.target.value)} style={inputStyle}>
            <option value="">Select a day…</option>
            {WEEKDAY_NAMES.map((name, d) => <option key={d} value={d}>{name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Assign To</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[...managersByRole.entries()].map(([role, roleManagers]) => (
              <div key={role}>
                <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>{roleLabels[role] || role}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                  {roleManagers.map((m) => (
                    <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={selectedIds.includes(m.id)}
                        onChange={() => setSelectedIds((prev) => prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id])} />
                      {m.name}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <button type="submit" disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Creating...' : 'Create Default Task'}
          </button>
        </div>
      </form>

      {templates.length > 0 && (
        <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {templates.map((t) => (
            <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: '0.6rem', padding: '0.9rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', opacity: t.is_active ? 1 : 0.55 }}>
              <div>
                <div style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{t.task_text}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Every {String(t.weekdays).split(',').map((d) => WEEKDAY_NAMES[parseInt(d, 10)]).join(', ')} · due 12 AM · {t.assignee_names || 'no managers'}{t.is_active ? '' : ' · paused'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" style={{ ...smallButtonStyle, backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--foreground)' }}
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
  );
}

export default function ManagerTasksClient({ managers, tasks, roleLabels, templates = [] }) {
  const router = useRouter();
  const [taskText, setTaskText] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const managersByRole = groupManagersByRole(managers);

  const toggleManager = (id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    const formData = new FormData();
    formData.set('task_text', taskText);
    formData.set('due_date', dueDate);
    formData.set('due_time', dueTime);
    selectedIds.forEach((id) => formData.append('assignee_ids', id));

    const result = await createManagerTask(formData);
    setSubmitting(false);

    if (result?.error) {
      setMessage({ type: 'error', text: result.error });
      return;
    }

    setMessage({ type: 'success', text: `Task assigned to ${result.assignedCount} manager(s).` });
    setTaskText('');
    setDueDate('');
    setDueTime('');
    setSelectedIds([]);
    router.refresh();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={cardStyle}>
        <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem' }}>Assign a New Task</h2>

        {message && (
          <div style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            backgroundColor: message.type === 'error' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(22, 178, 147, 0.1)',
            color: message.type === 'error' ? 'var(--danger)' : 'var(--success)',
            fontSize: '0.875rem',
          }}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Task</label>
            <textarea
              value={taskText}
              onChange={(e) => setTaskText(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Describe what needs to be done..."
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={labelStyle}>Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                // Clicking anywhere in the field opens the native date picker
                // (a calendar to click a day on), not just the small calendar
                // icon at the edge — showPicker() is supported in Chrome/Edge;
                // browsers without it just fall back to normal text-field focus.
                onClick={(e) => e.target.showPicker?.()}
                style={{ ...inputStyle, cursor: 'pointer' }}
              />
            </div>
            <div>
              <label style={labelStyle}>Due Time</label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                // Same as Due Date above — opens the native time picker, which
                // shows an explicit AM/PM toggle to click instead of having to
                // type/scroll that segment by hand.
                onClick={(e) => e.target.showPicker?.()}
                style={{ ...inputStyle, cursor: 'pointer' }}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Assign To</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[...managersByRole.entries()].map(([role, roleManagers]) => (
                <div key={role}>
                  <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                    {roleLabels[role] || role}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                    {roleManagers.map((m) => (
                      <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(m.id)}
                          onChange={() => toggleManager(m.id)}
                        />
                        {m.name}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {managers.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>No active managers found.</p>
              )}
            </div>
          </div>

          <div>
            <button type="submit" disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Assigning...' : 'Assign Task'}
            </button>
          </div>
        </form>
      </div>

      <DefaultTasksSection managers={managers} roleLabels={roleLabels} templates={templates} />

      <div style={cardStyle}>
        <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem' }}>Assigned Tasks</h2>

        {tasks.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No tasks assigned yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {tasks.map((task) => (
              <div key={task.id} style={{ border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', gap: '1rem' }}>
                  <div style={{ fontSize: '0.95rem', whiteSpace: 'pre-wrap' }}>{task.template_id ? '🔁 ' : ''}{task.task_text}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    Due {task.due_date} {task.template_id ? '(12 AM)' : task.due_time}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
                  {task.assignees.map((a) => (
                    <AssigneeStatus key={a.id} assignee={a} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
