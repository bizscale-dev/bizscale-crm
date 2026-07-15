'use client';

import { useState, useTransition } from 'react';
import { toggleFunnelTaskAction } from './funnel-actions';

const BRAND_COLOR = '#16b293';

export default function FunnelChecklist({ funnelClients }) {
  if (!funnelClients || funnelClients.length === 0) return null;

  return (
    <div className="card" style={{ border: `1px solid ${BRAND_COLOR}`, backgroundColor: 'rgba(22, 178, 147, 0.05)' }}>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', color: BRAND_COLOR }}>
        Client Onboarding (Funnel)
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {funnelClients.map(client => (
          <FunnelClientCard key={client.id} client={client} />
        ))}
      </div>
    </div>
  );
}

function FunnelClientCard({ client }) {
  const [tasks, setTasks] = useState(client.tasks);
  const [isPending, startTransition] = useTransition();

  const completed = tasks.filter(t => t.status === 'completed').length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const handleToggle = (taskId) => {
    const prev = tasks;
    setTasks(tasks.map(t => t.id === taskId ? { ...t, status: t.status === 'completed' ? 'pending' : 'completed' } : t));

    startTransition(async () => {
      const result = await toggleFunnelTaskAction(taskId);
      if (result.error) {
        setTasks(prev);
      }
    });
  };

  const tasksByCategory = {};
  tasks.forEach(t => {
    if (!tasksByCategory[t.category]) tasksByCategory[t.category] = [];
    tasksByCategory[t.category].push(t);
  });

  return (
    <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '0.5rem', backgroundColor: 'var(--card-bg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>{client.name}</h3>
          {client.website && (
            <a href={client.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'none' }}>
              {client.website}
            </a>
          )}
        </div>
        <span style={{
          fontSize: '0.75rem',
          padding: '0.3rem 0.6rem',
          backgroundColor: 'rgba(22, 178, 147, 0.1)',
          color: BRAND_COLOR,
          borderRadius: '0.25rem',
          fontWeight: '600'
        }}>
          Month {client.funnel_month} of 3
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <div style={{ flex: 1, height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: BRAND_COLOR }}></div>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {completed}/{total} ({pct}%)
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
        {Object.entries(tasksByCategory).map(([category, items]) => (
          <div key={category}>
            <p style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', margin: '0 0 0.4rem 0' }}>
              {category}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {items.map(task => (
                <label key={task.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer', opacity: isPending ? 0.7 : 1 }}>
                  <input
                    type="checkbox"
                    checked={task.status === 'completed'}
                    onChange={() => handleToggle(task.id)}
                    style={{ marginTop: '0.2rem' }}
                  />
                  <span>
                    <span style={{ textDecoration: task.status === 'completed' ? 'line-through' : 'none', color: task.status === 'completed' ? 'var(--text-muted)' : 'var(--foreground)' }}>
                      {task.platform}
                    </span>
                    {task.note && (
                      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{task.note}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
