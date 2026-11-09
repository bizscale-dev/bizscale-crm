'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitAssociateTaskProof } from './actions';
import TaskBadges from '@/components/TaskBadges';
import { TASK_URGENCIES, parseUrgency } from '@/lib/taskUrgency';
import { formatPkt, pktDay, dayLabel } from '@/lib/formatTime';

// "23:45" -> "11:45 PM". Due times are stored as Pakistan wall-clock time, so this is a
// format change only.
function formatDue12h(dueTime) {
  const m = /^(\d{1,2}):(\d{2})/.exec(dueTime || '');
  if (!m) return dueTime || '';
  const h = parseInt(m[1], 10);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

const BRAND_COLOR = 'var(--primary)';
const PORTAL = 'web-associate';

// Only the typed description is protected against accidental navigation — the
// image itself isn't persisted. Keyed per task so drafts for different tasks
// never collide.
function draftKey(taskId) {
  return `bizscale-task-draft-${PORTAL}-${taskId}-v1`;
}

function readDraft(taskId) {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(draftKey(taskId)) || '';
  } catch {
    return '';
  }
}

function writeDraft(taskId, description) {
  if (typeof window === 'undefined') return;
  try {
    if (description) {
      window.localStorage.setItem(draftKey(taskId), description);
    } else {
      window.localStorage.removeItem(draftKey(taskId));
    }
  } catch {
    // localStorage unavailable — draft persistence is a convenience, not required.
  }
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

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
  padding: '0.6rem 1.25rem',
  backgroundColor: BRAND_COLOR,
  color: 'white',
  border: 'none',
  borderRadius: '0.5rem',
  cursor: 'pointer',
  fontWeight: '600',
  fontSize: '0.875rem',
};

// Same overdue check the server re-validates in submitAssociateTaskProof —
// used here only to decide whether to show the mandatory reason field before
// submit; the server is the actual source of truth on whether it's late.
function isOverdue(task) {
  const dueAt = new Date(`${task.due_date}T${task.due_time}:00`);
  return !Number.isNaN(dueAt.getTime()) && new Date() > dueAt;
}

const APPROVAL_LABELS = {
  pending: { text: '⏳ Pending manager approval', color: '#f59e0b' },
  approved: { text: '✅ Approved', color: 'var(--success)' },
  rejected: { text: '❌ Rejected', color: 'var(--danger)' },
};

function TaskCard({ task, twelveHour }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const submitted = !!task.submitted_at;
  const overdue = !submitted && isOverdue(task);
  const [description, setDescription] = useState(() => submitted ? '' : readDraft(task.task_id));
  const [lateReason, setLateReason] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [imageError, setImageError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleDescriptionChange = (value) => {
    setDescription(value);
    writeDraft(task.task_id, value);
  };

  const handleFileChange = (e) => {
    setImageError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setImageDataUrl(null);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('Image is too large — max 2MB.');
      e.target.value = '';
      setImageDataUrl(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    setError(null);
    if (!description.trim()) {
      setError('Description is required');
      return;
    }
    if (overdue && !lateReason.trim()) {
      setError('This task is overdue — please give a reason before submitting');
      return;
    }

    setSubmitting(true);
    const result = await submitAssociateTaskProof(task.task_id, description, imageDataUrl, lateReason);
    setSubmitting(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    writeDraft(task.task_id, '');
    router.refresh();
  };

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: '0.75rem',
      padding: '1.25rem',
      backgroundColor: 'var(--card-bg)',
    }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); } }}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: open ? '0.75rem' : 0, cursor: 'pointer' }}
      >
        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: '1.4rem', flexShrink: 0 }}>{open ? '▾' : '▸'}</span>
        <div style={{ fontSize: '0.95rem', flex: 1, minWidth: 0, ...(open ? { whiteSpace: 'pre-wrap' } : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) }}><TaskBadges urgency={task.urgency} isDefault={!!(task.template_id || task.is_default)} />{task.task_text}</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', textAlign: 'right' }}>
          Due {task.due_date} {task.template_id ? '12 AM' : (twelveHour ? formatDue12h(task.due_time) : task.due_time)}
          {task.assigned_by && <div style={{ marginTop: '0.2rem' }}>Assigned by <strong style={{ color: 'var(--foreground)' }}>{task.assigned_by}</strong></div>}
        </div>
      </div>

      {!open ? null : submitted ? (
        <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: '600', marginBottom: '0.5rem' }}>
            ✅ Submitted {formatPkt(task.submitted_at)}
          </div>
          {!!task.is_late && (
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: '600', color: APPROVAL_LABELS[task.approval_status]?.color || '#f59e0b' }}>
                {APPROVAL_LABELS[task.approval_status]?.text || '⏳ Pending manager approval'} — submitted late
              </div>
              {task.late_reason && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Reason: {task.late_reason}
                </div>
              )}
            </div>
          )}
          <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem', whiteSpace: 'pre-wrap' }}>
            {task.submission_description}
          </div>
          {task.proof_image_base64 && (
            <img
              src={task.proof_image_base64}
              alt="Proof"
              style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '0.5rem', border: '1px solid var(--border)' }}
            />
          )}
        </div>
      ) : (
        <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {error && (
            <div style={{ fontSize: '0.85rem', color: 'var(--danger)' }}>{error}</div>
          )}
          {overdue && (
            <div style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: '600' }}>
              ⚠️ This task is overdue — submitting now will need manager approval.
            </div>
          )}
          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="What did you do to complete this task?"
            />
          </div>
          {overdue && (
            <div>
              <label style={labelStyle}>Reason for late submission</label>
              <textarea
                value={lateReason}
                onChange={(e) => setLateReason(e.target.value)}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="Why is this being submitted after the due date/time?"
              />
            </div>
          )}
          <div>
            <label style={labelStyle}>Proof Image (optional)</label>
            <input type="file" accept="image/*" onChange={handleFileChange} />
            {imageError && <div style={{ fontSize: '0.8rem', color: 'var(--danger)', marginTop: '0.35rem' }}>{imageError}</div>}
            {imageDataUrl && (
              <img
                src={imageDataUrl}
                alt="Preview"
                style={{ maxWidth: '100%', maxHeight: '200px', marginTop: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--border)' }}
              />
            )}
          </div>
          <div>
            <button type="button" onClick={handleSubmit} disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Completed tasks grouped by the Pakistan day they were submitted, newest day (and newest task) first.
function groupByDay(done) {
  const sorted = [...done].sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)));
  const groups = [];
  for (const t of sorted) {
    const day = pktDay(t.submitted_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.tasks.push(t);
    else groups.push({ day, tasks: [t] });
  }
  return groups;
}

export default function ManagerTasksClient({ tasks, urgencyFilter = false, twelveHour = false }) {
  const [urgency, setUrgency] = useState('');
  const visible = urgencyFilter && urgency ? tasks.filter((t) => parseUrgency(t.urgency) === urgency) : tasks;
  // New tasks on top, then completed ones grouped by day (today, yesterday, ...).
  const pending = visible.filter((t) => !t.submitted_at).sort((a, b) => b.task_id - a.task_id);
  const doneGroups = groupByDay(visible.filter((t) => !!t.submitted_at));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {urgencyFilter && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {TASK_URGENCIES.slice().reverse().map((u) => {
            const active = urgency === u.value;
            return (
              <button
                key={u.value}
                type="button"
                onClick={() => setUrgency(active ? '' : u.value)}
                style={{ padding: '0.35rem 1rem', borderRadius: '2rem', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', border: `1px solid ${u.color}`, color: active ? 'white' : u.color, backgroundColor: active ? u.color : 'transparent' }}
              >
                {u.label}
              </button>
            );
          })}
        </div>
      )}
      <div>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Pending Tasks</h2>
        {pending.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No pending tasks.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {pending.map((t) => <TaskCard key={t.task_id} task={t} twelveHour={twelveHour} />)}
          </div>
        )}
      </div>

      {doneGroups.length > 0 && (
        <div>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Completed Tasks</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {doneGroups.map((g) => (
              <div key={g.day}>
                <div style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '0.6rem' }}>
                  {dayLabel(g.day)} · {g.tasks.length}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {g.tasks.map((t) => <TaskCard key={t.task_id} task={t} twelveHour={twelveHour} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
