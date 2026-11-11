'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { setLinkStatus, setLinksPass, submitLinkReport } from './actions';

const SEVERITIES = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];
const TYPE_LABELS = { web2: 'Web 2.0', guestpost: 'Guest Post', pdf: 'PDF', profile: 'Profile', citation: 'Citation', image: 'Image' };
const typeLabel = (t) => TYPE_LABELS[t] || t;

const cardStyle = { backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '1.25rem' };
const inputStyle = { width: '100%', padding: '0.55rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)', fontSize: '0.875rem', boxSizing: 'border-box', fontFamily: 'inherit' };
const ghostBtn = { fontSize: '0.75rem', padding: '0.25rem 0.65rem', backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--foreground)', cursor: 'pointer', borderRadius: '0.4rem', fontWeight: '600' };

function StatChip({ label, value, color }) {
  return (
    <div style={{ padding: '0.35rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)', minWidth: '84px' }}>
      <div style={{ fontSize: '1.05rem', fontWeight: '700', color }}>{value}</div>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
    </div>
  );
}

// One link: the URL, a Pass / Fail mark and a Report button that opens a tiny comment form.
function LinkRow({ kind, associate, client, type, link, date, status, onStatus, onReported }) {
  const url = link?.url || '';
  const [reporting, setReporting] = useState(false);
  const [comment, setComment] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const mark = async (next) => {
    const value = status === next ? '' : next; // clicking the active mark clears it
    onStatus(value);
    const res = await setLinkStatus({ kind, clientId: client.clientId, url, status: value });
    if (res?.error) { onStatus(status); setMessage({ error: true, text: res.error }); }
  };

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await submitLinkReport({ kind, associateId: associate.id, clientId: client.clientId, linkType: type, linkUrl: url, comment, severity, date });
    setBusy(false);
    if (res?.error) return setMessage({ error: true, text: res.error });
    setMessage({ text: `Reported — ${res.associate} has been notified.` });
    setReporting(false);
    setComment('');
    if (url) onStatus('fail');
    onReported();
  };

  const pass = status === 'pass';
  const fail = status === 'fail';
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" title={url} style={{ flex: '1 1 220px', minWidth: 0, fontSize: '0.8rem', color: 'var(--primary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            🔗 {url.replace(/^https?:\/\/(www\.)?/, '')}
          </a>
        ) : (
          <span style={{ flex: '1 1 220px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>no link recorded</span>
        )}
        {url && (
          <>
            <button type="button" onClick={() => mark('pass')} style={{ ...ghostBtn, ...(pass ? { backgroundColor: 'var(--success)', borderColor: 'var(--success)', color: 'white' } : { color: 'var(--success)', borderColor: 'var(--success)' }) }}>
              ✓ Pass
            </button>
            <button type="button" onClick={() => mark('fail')} style={{ ...ghostBtn, ...(fail ? { backgroundColor: 'var(--danger)', borderColor: 'var(--danger)', color: 'white' } : { color: 'var(--danger)', borderColor: 'var(--danger)' }) }}>
              ✕ Fail
            </button>
          </>
        )}
        <button type="button" onClick={() => setReporting(!reporting)} style={{ ...ghostBtn, ...(reporting ? { backgroundColor: 'var(--primary)', borderColor: 'var(--primary)', color: 'white' } : {}) }}>
          {reporting ? 'Cancel' : 'Report'}
        </button>
      </div>
      {message && (
        <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: message.error ? 'var(--danger)' : 'var(--success)' }}>{message.text}</div>
      )}
      {reporting && (
        <form onSubmit={send} style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '0.5rem', backgroundColor: 'var(--background)' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {client.name} · {typeLabel(type)} · {associate.name}
          </div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Comment (optional) — where exactly the issue is…" />
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} style={{ ...inputStyle, width: 'auto' }} aria-label="Severity">
              {SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label} severity</option>)}
            </select>
            <button type="submit" disabled={busy} className="btn" style={{ marginLeft: 'auto', padding: '0.45rem 1.1rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: '600', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Sending…' : 'Send report'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// Copies every link of one client (all link types, one URL per line) to the clipboard.
function CopyLinksButton({ client }) {
  const [state, setState] = useState('');
  const urls = client.types.flatMap((t) => t.links.map((l) => l.url));
  if (urls.length === 0) return null;

  const copy = async () => {
    const text = urls.join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for browsers / contexts without the async clipboard API.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (!ok) { setState('failed'); setTimeout(() => setState(''), 2000); return; }
    }
    setState('copied');
    setTimeout(() => setState(''), 2000);
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy all ${urls.length} link${urls.length === 1 ? '' : 's'} of ${client.name}`}
      style={{ ...ghostBtn, fontSize: '0.75rem', padding: '0.25rem 0.7rem', whiteSpace: 'nowrap', ...(state === 'copied' ? { color: 'var(--success)', borderColor: 'var(--success)' } : state === 'failed' ? { color: 'var(--danger)', borderColor: 'var(--danger)' } : {}) }}
    >
      {state === 'copied' ? `✓ Copied ${urls.length}` : state === 'failed' ? 'Copy failed' : `Copy ${urls.length} link${urls.length === 1 ? '' : 's'}`}
    </button>
  );
}

// Marks every link of one client that has no mark yet as Pass in one click (links already marked Fail stay Fail).
function PassAllButton({ kind, client, statuses, onPassed }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const urls = client.types.flatMap((t) => t.links.map((l) => l.url));
  const todo = urls.filter((u) => !statuses[`${client.clientId}|${u}`]);
  if (urls.length === 0) return null;

  const run = async () => {
    setBusy(true);
    setError('');
    const res = await setLinksPass({ kind, clientId: client.clientId, urls: todo });
    setBusy(false);
    if (res?.error) return setError(res.error);
    onPassed(todo);
  };

  return (
    <>
      {error && <span style={{ fontSize: '0.72rem', color: 'var(--danger)' }}>{error}</span>}
      <button
        type="button"
        onClick={run}
        disabled={busy || todo.length === 0}
        title={todo.length === 0 ? 'Every link of this client is already marked' : `Mark ${todo.length} unchecked link${todo.length === 1 ? '' : 's'} of ${client.name} as Pass`}
        style={{ ...ghostBtn, fontSize: '0.75rem', padding: '0.25rem 0.7rem', whiteSpace: 'nowrap', color: 'var(--success)', borderColor: 'var(--success)', opacity: busy || todo.length === 0 ? 0.45 : 1 }}
      >
        {busy ? 'Saving…' : todo.length === 0 ? '✓ All marked' : `✓ Pass all (${todo.length})`}
      </button>
    </>
  );
}

function AssociateCard({ kind, associate, date }) {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState(associate.stats);
  // `${clientId}|${url}` -> 'pass' | 'fail'
  const [statuses, setStatuses] = useState(() => {
    const m = {};
    for (const c of associate.clients) for (const t of c.types) for (const l of t.links) if (l.status) m[`${c.clientId}|${l.url}`] = l.status;
    return m;
  });
  const setStatus = (key) => (value) => setStatuses((prev) => {
    const next = { ...prev };
    if (value) next[key] = value; else delete next[key];
    return next;
  });
  const passMany = (clientId) => (urls) => setStatuses((prev) => {
    const next = { ...prev };
    for (const u of urls) next[`${clientId}|${u}`] = 'pass';
    return next;
  });
  const reported = () => setStats((s) => ({ ...s, total: s.total + 1, pending: s.pending + 1 }));

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '1.05rem', fontWeight: '600' }}>{associate.name}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {associate.total} link{associate.total === 1 ? '' : 's'} on {associate.clients.length} client{associate.clients.length === 1 ? '' : 's'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <StatChip label="Total issues" value={stats.total} color="var(--primary)" />
          <StatChip label="Resolved" value={stats.resolved} color="var(--success)" />
          <StatChip label="Pending" value={stats.pending} color="#f59e0b" />
        </div>
        <button type="button" onClick={() => setOpen(!open)} className="btn" style={{ ...ghostBtn, fontSize: '0.8rem', padding: '0.4rem 0.9rem' }}>
          {open ? 'Hide work' : 'Show work'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {associate.clients.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.85rem' }}>Nothing completed on this day.</p>
          ) : associate.clients.map((c) => (
            <div key={c.clientId} style={{ border: '1px solid var(--border)', borderRadius: '0.6rem', padding: '0.8rem 1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{c.name}</div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <PassAllButton kind={kind} client={c} statuses={statuses} onPassed={passMany(c.clientId)} />
                  <CopyLinksButton client={c} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {c.types.map((t) => (
                  <div key={t.type}>
                    <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>{typeLabel(t.type)} · {t.count}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      {(t.links.length ? t.links : [null]).map((l, i) => {
                        const key = l ? `${c.clientId}|${l.url}` : null;
                        return (
                          <LinkRow
                            key={l ? l.url : `none-${i}`}
                            kind={kind} associate={associate} client={c} type={t.type} link={l} date={date}
                            status={key ? statuses[key] || '' : ''}
                            onStatus={key ? setStatus(key) : () => {}}
                            onReported={reported}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AssociateWorkView({ kind, associates, date, today }) {
  const router = useRouter();
  const pathname = usePathname();
  const go = (d) => router.push(`${pathname}?date=${d}`);
  const shift = (days) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    go(d.toISOString().slice(0, 10));
  };
  const grandTotal = associates.reduce((a, x) => a + x.total, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => shift(-1)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>←</button>
        <input type="date" value={date} max={today} onChange={(e) => e.target.value && go(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
        <button type="button" onClick={() => shift(1)} disabled={date >= today} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', opacity: date >= today ? 0.4 : 1 }}>→</button>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{grandTotal} links completed by {associates.filter((a) => a.total > 0).length} of {associates.length} associates</span>
      </div>
      {associates.length === 0 ? (
        <div style={cardStyle}><p style={{ margin: 0, color: 'var(--text-muted)' }}>No associates.</p></div>
      ) : associates.map((a) => <AssociateCard key={`${a.id}-${date}`} kind={kind} associate={a} date={date} />)}
    </div>
  );
}
