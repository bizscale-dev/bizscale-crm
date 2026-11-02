'use client';

import { useMemo, useState } from 'react';

const inputStyle = {
  padding: '0.55rem 0.8rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: '0.875rem',
};

function statusOf(c) {
  if (!c.isActive) return { key: 'deactivated', label: 'Deactivated', color: 'var(--text-muted)' };
  if (c.tunnelStatus === 'hold') return { key: 'hold', label: 'On hold', color: '#f59e0b' };
  if (c.tunnelStatus === 'active') return { key: 'funnel', label: `Funnel · Month ${c.funnelMonth || 1}`, color: '#3b82f6' };
  return { key: 'regular', label: 'Regular', color: 'var(--success)' };
}

const percentOf = (c) => (c.target > 0 ? Math.round((c.completed / c.target) * 100) : 0);

export default function CampaignClientsTable({ clients, linkTypeLabels, archivedAt }) {
  const [search, setSearch] = useState('');
  const [associate, setAssociate] = useState('all');
  const [status, setStatus] = useState('all');
  const [openId, setOpenId] = useState(null);

  const associates = useMemo(
    () => [...new Set(clients.map((c) => c.associate).filter(Boolean))].sort(),
    [clients]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !(c.website || '').toLowerCase().includes(q)) return false;
      if (associate !== 'all' && c.associate !== associate) return false;
      if (status !== 'all' && statusOf(c).key !== status) return false;
      return true;
    });
  }, [clients, search, associate, status]);

  const totals = useMemo(() => ({
    target: filtered.reduce((s, c) => s + c.target, 0),
    completed: filtered.reduce((s, c) => s + c.completed, 0),
  }), [filtered]);
  const totalPercent = totals.target > 0 ? Math.round((totals.completed / totals.target) * 100) : 0;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Clients in this campaign ({clients.length})</h2>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {archivedAt ? `Archived ${new Date(archivedAt.replace(' ', 'T') + 'Z').toLocaleDateString()}` : 'Live data'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search client or website…" style={{ ...inputStyle, gridColumn: 'span 2' }} />
        <select value={associate} onChange={(e) => setAssociate(e.target.value)} style={inputStyle}>
          <option value="all">All associates</option>
          {associates.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
          <option value="all">All statuses</option>
          <option value="regular">Regular</option>
          <option value="funnel">Funnel</option>
          <option value="hold">On hold</option>
          <option value="deactivated">Deactivated</option>
        </select>
      </div>

      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        {filtered.length} client{filtered.length === 1 ? '' : 's'} · {totals.completed} / {totals.target} links ({totalPercent}%)
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>No clients match.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '0.6rem 0.75rem 0.6rem 0' }}>Client</th>
                <th style={{ padding: '0.6rem 0.75rem 0.6rem 0' }}>Associate</th>
                <th style={{ padding: '0.6rem 0.75rem 0.6rem 0' }}>Writer</th>
                <th style={{ padding: '0.6rem 0.75rem 0.6rem 0' }}>Status</th>
                <th style={{ padding: '0.6rem 0 0.6rem 0', minWidth: '190px' }}>Progress</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const st = statusOf(c);
                const pct = percentOf(c);
                const open = openId === c.id;
                const types = Object.entries(c.byType);
                return (
                  <tr key={c.id} style={{ borderTop: '1px solid var(--border)', verticalAlign: 'top' }}>
                    <td style={{ padding: '0.75rem 0.75rem 0.75rem 0' }}>
                      <div style={{ fontWeight: '600' }}>{c.name}</div>
                      {c.website && (
                        <a href={c.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'none' }}>{c.website}</a>
                      )}
                      {open && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.6rem' }}>
                          {types.length === 0 ? (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No tasks were generated for this client.</span>
                          ) : types.map(([type, t]) => (
                            <span key={type} style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem', borderRadius: '1rem', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                              {linkTypeLabels[type] || type} <strong>{t.completed}/{t.target}</strong>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 0.75rem 0.75rem 0' }}>{c.associate || '—'}</td>
                    <td style={{ padding: '0.75rem 0.75rem 0.75rem 0' }}>{c.writer || '—'}</td>
                    <td style={{ padding: '0.75rem 0.75rem 0.75rem 0' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: '600', padding: '0.15rem 0.6rem', borderRadius: '1rem', border: `1px solid ${st.color}`, color: st.color, whiteSpace: 'nowrap' }}>{st.label}</span>
                    </td>
                    <td style={{ padding: '0.75rem 0' }}>
                      <div style={{ height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.3rem' }}>
                        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', backgroundColor: pct >= 100 ? 'var(--success)' : 'var(--primary)' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <span>{c.completed} / {c.target} ({pct}%)</span>
                        <button type="button" onClick={() => setOpenId(open ? null : c.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}>
                          {open ? 'Hide' : 'By type'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
