'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function TasksClient({ tasksByClient, availableDates, selectedDate, today, linkTypeLabels }) {
  const router = useRouter();

  const handleDateChange = (e) => {
    router.push(`/associate/tasks?date=${e.target.value}`);
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
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>No tasks scheduled for {selectedDate}.</p>
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
              {client.tasks.map(task => {
                const pct = task.target_count > 0 ? Math.round((task.completed_count / task.target_count) * 100) : 0;
                const done = task.completed_count >= task.target_count;
                return (
                  <div key={task.id} style={{ 
                    padding: '1rem', border: `1px solid ${done ? 'var(--success)' : 'var(--border)'}`, 
                    borderRadius: '0.5rem', minWidth: '160px', flex: '1'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontWeight: '600', fontSize: '0.875rem' }}>{linkTypeLabels[task.link_type] || task.link_type}</span>
                      {done && <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>✓ Done</span>}
                    </div>
                    <div style={{ marginBottom: '0.5rem' }}>
                      <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: done ? 'var(--success)' : 'var(--primary)' }}></div>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {task.completed_count} / {task.target_count} ({pct}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)'
};
