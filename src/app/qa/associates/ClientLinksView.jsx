'use client';

import { useMemo, useState } from 'react';
import { LinkRow, PassAllButton, CopyLinksButton } from './AssociateWorkView';

const TYPE_LABELS = { web2: 'Web 2.0', guestpost: 'Guest Post', pdf: 'PDF', profile: 'Profile', citation: 'Citation', image: 'Image' };
const typeLabel = (t) => TYPE_LABELS[t] || t;
const cardStyle = { backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '1rem 1.25rem' };
const inputStyle = { padding: '0.5rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)', fontSize: '0.875rem', fontFamily: 'inherit' };
const ghostBtn = { fontSize: '0.8rem', padding: '0.4rem 0.9rem', backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--foreground)', cursor: 'pointer', borderRadius: '0.4rem', fontWeight: '600' };

function Chip({ text, color }) {
  return <span style={{ fontSize: '0.68rem', fontWeight: '700', color, backgroundColor: 'var(--background)', border: `1px solid ${color}`, padding: '0.1rem 0.5rem', borderRadius: '1rem', whiteSpace: 'nowrap' }}>{text}</span>;
}

function ClientCard({ kind, client, open, onToggle }) {
  // `${clientId}|${url}` -> 'pass' | 'fail'
  const [statuses, setStatuses] = useState(() => {
    const m = {};
    for (const t of client.types) for (const l of t.links) if (l.status) m[`${client.clientId}|${l.url}`] = l.status;
    return m;
  });
  const setStatus = (key) => (value) => setStatuses((prev) => {
    const next = { ...prev };
    if (value) next[key] = value; else delete next[key];
    return next;
  });
  const passMany = (urls) => setStatuses((prev) => {
    const next = { ...prev };
    for (const u of urls) next[`${client.clientId}|${u}`] = 'pass';
    return next;
  });

  const keys = client.types.flatMap((t) => t.links.map((l) => `${client.clientId}|${l.url}`));
  const pass = keys.filter((k) => statuses[k] === 'pass').length;
  const fail = keys.filter((k) => statuses[k] === 'fail').length;
  const left = keys.length - pass - fail;

  return (
    <div style={cardStyle}>
      <div role="button" tabIndex={0} aria-expanded={open} onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', minWidth: 0 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{open ? '▾' : '▸'}</span>
          <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>{client.name}</span>
          {client.sheetUrl && (
            <a href={client.sheetUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
              style={{ fontSize: '0.72rem', fontWeight: '600', color: 'var(--primary)', textDecoration: 'none', whiteSpace: 'nowrap' }}>📄 Open sheet ↗</a>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{keys.length} link{keys.length === 1 ? '' : 's'}</span>
          {pass > 0 && <Chip text={`✓ ${pass}`} color="var(--success)" />}
          {fail > 0 && <Chip text={`✕ ${fail}`} color="var(--danger)" />}
          {left > 0 && <Chip text={`${left} to check`} color="#f59e0b" />}
        </div>
      </div>

      {open && (
        <div style={{ marginTop: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <PassAllButton kind={kind} client={client} statuses={statuses} onPassed={passMany} />
            <CopyLinksButton client={client} />
          </div>
          {client.types.map((t) => (
            <div key={t.type}>
              <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>{typeLabel(t.type)} · {t.count}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {t.links.map((l) => {
                  const key = `${client.clientId}|${l.url}`;
                  const assoc = l.associateId ? { id: l.associateId, name: l.associateName || 'Associate' } : null;
                  const meta = [l.associateName ? `by ${l.associateName}` : null, l.date ? `done ${l.date}` : 'older link'].filter(Boolean).join(' · ');
                  return (
                    <LinkRow
                      key={key}
                      kind={kind} associate={assoc || { id: 0, name: '' }} client={client} type={t.type} link={l} date={l.date || ''}
                      status={statuses[key] || ''} onStatus={setStatus(key)} onReported={() => {}}
                      meta={meta} canReport={!!assoc}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ClientLinksView({ kind, clients }) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const q = query.trim().toLowerCase();
  const visible = useMemo(() => (q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients), [clients, q]);
  const totalLinks = clients.reduce((a, c) => a + c.total, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a client…" style={{ ...inputStyle, minWidth: '240px' }} />
        <button type="button" onClick={() => setOpenId(null)} style={ghostBtn}>Collapse all</button>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{visible.length} client{visible.length === 1 ? '' : 's'} · {totalLinks} links in total</span>
      </div>
      {visible.length === 0 ? (
        <div style={cardStyle}><p style={{ margin: 0, color: 'var(--text-muted)' }}>No clients with links.</p></div>
      ) : visible.map((c) => (
        <ClientCard key={c.clientId} kind={kind} client={c} open={openId === c.clientId} onToggle={() => setOpenId(openId === c.clientId ? null : c.clientId)} />
      ))}
    </div>
  );
}
