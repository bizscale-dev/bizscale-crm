'use client';

import { useRouter } from 'next/navigation';

const inputStyle = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)'
};

export default function WriterTasksClient({
  gbpTasksByClient = [],
  weboffTasksByClient = [],
  gbpPendingByClient = [],
  weboffPendingByClient = [],
  availableDates,
  selectedDate,
  today,
}) {
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
      </div>

      <PendingSection
        title="Pending Tasks — GBP-Off Page"
        pendingByClient={gbpPendingByClient}
      />

      <PendingSection
        title="Pending Tasks — Web-Off Page"
        pendingByClient={weboffPendingByClient}
      />

      <OffpageSection
        title="GBP-Off Page Tasks"
        subtitle="Marked Done directly in the Google Sheet — this is a live progress mirror"
        tasksByClient={gbpTasksByClient}
        selectedDate={selectedDate}
      />

      <OffpageSection
        title="Web-Off Page Tasks"
        subtitle="Marked Done directly in the Google Sheet — this is a live progress mirror"
        tasksByClient={weboffTasksByClient}
        selectedDate={selectedDate}
      />
    </div>
  );
}

// Tasks whose scheduled day has already passed but are still not fully done —
// surfaced separately so they don't just silently disappear once their day is over.
function PendingSection({ title, pendingByClient }) {
  if (pendingByClient.length === 0) return null;

  const totalCount = pendingByClient.reduce((s, c) => s + c.tasks.length, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.5rem 0' }}>
        <h2 style={{ fontSize: '1.1rem', margin: 0, color: '#f59e0b' }}>{title}</h2>
        <span style={{
          fontSize: '0.75rem', fontWeight: '600', color: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.12)', padding: '0.15rem 0.5rem', borderRadius: '1rem',
        }}>
          {totalCount} overdue
        </span>
      </div>

      {pendingByClient.map(client => (
        <div key={client.client_id} className="card" style={{ border: '1px solid rgba(245, 158, 11, 0.4)' }}>
          <div style={{ marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600' }}>{client.client_name}</h3>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            {client.tasks.map(task => (
              <PendingTaskCard key={task.id} task={task} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PendingTaskCard({ task }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.6rem',
      padding: '0.65rem 1rem',
      minWidth: '200px',
      flex: '1',
      border: '1px solid rgba(245, 158, 11, 0.4)',
      borderRadius: '0.5rem',
      backgroundColor: 'rgba(245, 158, 11, 0.06)',
    }}>
      <span style={{ fontWeight: '600', fontSize: '0.9rem', flex: 1 }}>{task.category}</span>
      <span style={{ fontSize: '0.7rem', fontWeight: '600', color: '#f59e0b', whiteSpace: 'nowrap' }}>
        Due {task.task_date}
      </span>
    </div>
  );
}

function OffpageSection({ title, subtitle, tasksByClient, selectedDate }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.5rem 0' }}>
        <h2 style={{ fontSize: '1.1rem', margin: 0 }}>{title}</h2>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{subtitle}</span>
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
              {client.tasks.map(task => (
                <ReadOnlyTaskCard key={task.id} task={task} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// Read-only — the Google Sheet's Status column is the only place these get marked
// Done (see writerOffpageSync.js), so this just displays live progress, no logging UI.
function ReadOnlyTaskCard({ task }) {
  const done = task.completed_count >= task.target_count;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.6rem',
      padding: '0.65rem 1rem',
      minWidth: '200px',
      flex: '1',
      border: `1px solid ${done ? 'var(--success)' : 'var(--border)'}`,
      borderRadius: '0.5rem',
      backgroundColor: done ? 'rgba(34, 197, 94, 0.08)' : 'var(--background)',
    }}>
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '22px',
        height: '22px',
        borderRadius: '50%',
        flexShrink: 0,
        backgroundColor: done ? 'var(--success)' : 'var(--border)',
        color: done ? 'white' : 'var(--text-muted)',
        fontSize: '0.75rem',
        fontWeight: 'bold',
      }}>
        {done ? '✓' : ''}
      </span>
      <span style={{ fontWeight: '600', fontSize: '0.9rem', flex: 1 }}>{task.category}</span>
      <span style={{ fontSize: '0.7rem', fontWeight: '600', color: done ? 'var(--success)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {done ? 'Complete' : 'Pending'}
      </span>
    </div>
  );
}
