'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function parseJsonList(v) {
  try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}

// "Check every client" task (the ranking checks): one checkbox per client, the task is done when the last one is
// ticked. `onToggle(taskId, index, checked)` is the portal's own server action (SEO or Web SEO associate).
export default function ClientChecklist({ task, onToggle }) {
  const router = useRouter();
  const clients = parseJsonList(task.checklist);
  const [checked, setChecked] = useState(() => new Set(parseJsonList(task.checklist_done)));
  const [error, setError] = useState(null);

  const toggle = async (i) => {
    const on = !checked.has(i);
    const apply = (value) => setChecked((prev) => { const next = new Set(prev); if (value) next.add(i); else next.delete(i); return next; });
    apply(on);
    setError(null);
    const result = await onToggle(task.task_id, i, on);
    if (result?.error) { apply(!on); return setError(result.error); }
    if (result.submitted) router.refresh();
  };

  return (
    <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Clients checked · {checked.size}/{clients.length}</div>
      <div style={{ height: '5px', borderRadius: '3px', backgroundColor: 'var(--border)', marginBottom: '0.7rem', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${clients.length ? (checked.size / clients.length) * 100 : 0}%`, backgroundColor: 'var(--primary)', transition: 'width 0.2s' }} />
      </div>
      {error && <div style={{ fontSize: '0.8rem', color: 'var(--danger)', marginBottom: '0.5rem' }}>{error}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {clients.map((name, i) => (
          <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontSize: '0.875rem', cursor: 'pointer', textDecoration: checked.has(i) ? 'line-through' : 'none', color: checked.has(i) ? 'var(--text-muted)' : 'inherit' }}>
            <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} />
            {name}
          </label>
        ))}
        {clients.length === 0 && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No clients assigned to you.</div>}
      </div>
      <div style={{ marginTop: '0.7rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>The task is done as soon as every client is ticked.</div>
    </div>
  );
}
