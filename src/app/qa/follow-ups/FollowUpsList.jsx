'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Linkify from '../Linkify';
import LinkList from '@/components/LinkList';
import { cardStyle } from '../qaStyles';
import { markFollowUpChecked } from './actions';

const MANAGER_STATUS = {
  open: { label: 'Manager: not resolved yet', color: '#f59e0b' },
  resolved: { label: 'Manager: marked resolved', color: 'var(--success)' },
};

function subjectOf(r) {
  if (r.source === 'manager_task') return `Task: ${(r.work_done || '').slice(0, 100)}`;
  return r.web_client_name || r.title || 'Report';
}

export default function FollowUpsList({ items }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const check = async (id) => {
    setBusyId(id);
    setError(null);
    const res = await markFollowUpChecked(id);
    setBusyId(null);
    if (res?.error) setError(res.error);
    router.refresh();
  };

  if (items.length === 0) {
    return <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--text-muted)' }}>Nothing to follow up on today.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>Today you have to check these ({items.length})</div>
      {error && <div style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</div>}
      {items.map((r) => {
        const st = MANAGER_STATUS[r.status] || MANAGER_STATUS.open;
        return (
          <div key={r.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              <div>
                <strong>{subjectOf(r)}</strong>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {r.manager_name} · filed {r.created_at.slice(0, 10)} by {r.filed_by}
                </div>
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: '600', color: st.color }}>{st.label}</span>
            </div>
            <div style={{ fontSize: '0.875rem', wordBreak: 'break-word', marginBottom: '0.5rem' }}>
              <Linkify text={r.note} />
            </div>
            <LinkList text={r.page_url} style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }} />
            {r.resolution_note && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Manager&apos;s note: {r.resolution_note}
              </div>
            )}
            <button
              type="button"
              disabled={busyId === r.id}
              onClick={() => check(r.id)}
              style={{ padding: '0.55rem 1.3rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: '600', fontSize: '0.85rem', cursor: 'pointer', opacity: busyId === r.id ? 0.6 : 1 }}
            >
              {busyId === r.id ? 'Saving...' : 'Mark checked'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
