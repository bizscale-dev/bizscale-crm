'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { logPost, deletePost } from '../actions';

const POST_TYPE_LABELS = { guestpost: 'Guest Post', web2: 'Web 2.0', pdf: 'PDF Submission' };

const inputStyle = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)'
};

export default function WriterTasksClient({ tasksByClient, availableDates, selectedDate, today }) {
  const router = useRouter();

  const handleDateChange = (e) => {
    router.push(`/writer/tasks?date=${e.target.value}`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Date selector */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <label style={{ fontWeight: '500' }}>Select Date:</label>
        <select value={selectedDate} onChange={handleDateChange} style={inputStyle}>
          {availableDates.map(d => (
            <option key={d.task_date} value={d.task_date}>
              Day {d.day_number} — {d.task_date}{d.task_date === today ? ' (Today)' : ''}
            </option>
          ))}
        </select>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          {tasksByClient.length} client(s) scheduled
        </span>
      </div>

      {tasksByClient.length === 0 ? (
        <div className="card">
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>No clients scheduled for {selectedDate}.</p>
        </div>
      ) : (
        tasksByClient.map(client => (
          <div key={client.client_id} className="card">
            <div style={{ marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600' }}>{client.client_name}</h3>
              {client.website && (
                <a href={client.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.875rem', color: 'var(--primary)', textDecoration: 'none' }}>
                  {client.website}
                </a>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {client.tasks.map(task => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function TaskCard({ task }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Logs are ordered newest-first (see page.js query), so logs[0] is the "top of
  // the stack" to remove when unchecking. Read straight from the `task` prop — a
  // fresh copy arrives via router.refresh() after each mutation below.
  const logs = task.logs;

  const completedCount = logs.length;
  const pct = task.target_count > 0 ? Math.round((completedCount / task.target_count) * 100) : 0;
  const done = completedCount >= task.target_count;
  const label = POST_TYPE_LABELS[task.post_type] || task.post_type;

  const handleToggle = (index) => {
    const checked = index < completedCount;

    startTransition(async () => {
      if (checked) {
        // Unchecking box `index` removes everything back down to that level.
        const toRemove = logs.slice(0, completedCount - index);
        for (const log of toRemove) {
          await deletePost(log.id);
        }
      } else {
        // Checking box `index` adds enough posts to reach that level.
        for (let i = completedCount; i <= index; i++) {
          const formData = new FormData();
          formData.set('taskId', task.id);
          formData.set('title', `${label} #${i + 1}`);
          formData.set('url', '');
          formData.set('word_count', '');
          await logPost(null, formData);
        }
      }
      router.refresh();
    });
  };

  return (
    <div style={{
      padding: '1rem',
      border: `1px solid ${done ? 'var(--success)' : 'var(--border)'}`,
      borderRadius: '0.5rem',
      backgroundColor: 'var(--background)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>{label}</span>
        {done && <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: '600' }}>✓ Done</span>}
      </div>
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: done ? 'var(--success)' : 'var(--primary)' }}></div>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {completedCount} / {task.target_count} posts ({pct}%)
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
        {Array.from({ length: task.target_count }).map((_, index) => {
          const checked = index < completedCount;
          return (
            <label
              key={index}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem',
                cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.6 : 1
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={isPending}
                onChange={() => handleToggle(index)}
              />
              #{index + 1}
            </label>
          );
        })}
      </div>
    </div>
  );
}
