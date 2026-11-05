'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { submitAssociateReport } from './actions';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const SEVERITIES = [
  { value: 'high', label: 'High', color: 'var(--danger)' },
  { value: 'medium', label: 'Medium', color: '#f59e0b' },
  { value: 'low', label: 'Low', color: 'var(--success)' },
];
const TYPE_LABELS = { web2: 'Web 2.0', guestpost: 'Guest Post', pdf: 'PDF', profile: 'Profile', citation: 'Citation', image: 'Image' };
const typeLabel = (t) => TYPE_LABELS[t] || t;

const cardStyle = { backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '1.25rem' };
const inputStyle = { width: '100%', padding: '0.55rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)', fontSize: '0.875rem', boxSizing: 'border-box', fontFamily: 'inherit' };
const labelStyle = { display: 'block', marginBottom: '0.35rem', fontSize: '0.72rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.02em' };

function ReportForm({ associate, date, onDone }) {
  const [client, setClient] = useState('');
  const [link, setLink] = useState(''); // "<type>||<url>" or ''
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const chosen = associate.clients.find((c) => c.name === client);
  const linkOptions = chosen ? chosen.types.flatMap((t) => (t.links.length ? t.links.map((u) => ({ type: t.type, url: u })) : [{ type: t.type, url: '' }])) : [];

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return setScreenshot(null);
    if (f.size > MAX_IMAGE_BYTES) { setMessage({ error: true, text: 'Image is too large — max 2MB.' }); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => setScreenshot(reader.result);
    reader.readAsDataURL(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const [linkType = '', linkUrl = ''] = link ? link.split('||') : [];
    const res = await submitAssociateReport({ associateId: associate.id, client, linkType, linkUrl, description, severity, date, screenshot });
    setBusy(false);
    if (res?.error) return setMessage({ error: true, text: res.error });
    setMessage({ text: `Report sent to ${res.sentTo.join(', ')} (${res.resolveDays} working days to resolve).` });
    setClient(''); setLink(''); setDescription(''); setSeverity(''); setScreenshot(null); setFileKey((k) => k + 1);
    onDone?.();
  };

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
      <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>Report {associate.name}</div>
      {message && (
        <div style={{ padding: '0.6rem 0.85rem', borderRadius: '0.5rem', fontSize: '0.825rem', backgroundColor: message.error ? 'rgba(220,38,38,0.1)' : 'rgba(22,178,147,0.1)', color: message.error ? 'var(--danger)' : 'var(--success)' }}>{message.text}</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
        <div>
          <label style={labelStyle}>Client</label>
          <select value={client} onChange={(e) => { setClient(e.target.value); setLink(''); }} style={inputStyle} required>
            <option value="">Pick a client…</option>
            {associate.clients.map((c) => <option key={c.clientId} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Link (optional)</label>
          <select value={link} onChange={(e) => setLink(e.target.value)} style={inputStyle} disabled={!chosen}>
            <option value="">{chosen ? 'Whole client / no specific link' : 'Pick a client first'}</option>
            {linkOptions.map((o, i) => (
              <option key={i} value={`${o.type}||${o.url}`}>{typeLabel(o.type)}{o.url ? ` — ${o.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}` : ''}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label style={labelStyle}>What is wrong</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="e.g. link is dead / wrong anchor / not the client's niche…" required />
      </div>
      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={labelStyle}>Severity</label>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {SEVERITIES.map((s) => (
              <button key={s.value} type="button" onClick={() => setSeverity(s.value)}
                style={{ padding: '0.35rem 0.9rem', borderRadius: '2rem', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', border: `1px solid ${s.color}`, color: severity === s.value ? 'white' : s.color, backgroundColor: severity === s.value ? s.color : 'transparent' }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Screenshot (optional)</label>
          <input key={fileKey} type="file" accept="image/*" onChange={onFile} />
        </div>
        <button type="submit" disabled={busy} className="btn" style={{ marginLeft: 'auto', padding: '0.55rem 1.25rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: '600', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Sending…' : 'Send report'}
        </button>
      </div>
    </form>
  );
}

function AssociateCard({ associate, date }) {
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '1.05rem', fontWeight: '600' }}>{associate.name}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {associate.total} link{associate.total === 1 ? '' : 's'} on {associate.clients.length} client{associate.clients.length === 1 ? '' : 's'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" onClick={() => setOpen(!open)} className="btn" style={{ fontSize: '0.8rem', padding: '0.4rem 0.9rem', backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--foreground)', cursor: 'pointer', borderRadius: '0.5rem' }}>
            {open ? 'Hide work' : 'Show work'}
          </button>
          {associate.total > 0 && (
            <button type="button" onClick={() => { setOpen(true); setReporting(!reporting); }} className="btn" style={{ fontSize: '0.8rem', padding: '0.4rem 0.9rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}>
              {reporting ? 'Close report' : 'Report'}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {associate.clients.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.85rem' }}>Nothing completed on this day.</p>
          ) : associate.clients.map((c) => (
            <div key={c.clientId} style={{ border: '1px solid var(--border)', borderRadius: '0.6rem', padding: '0.8rem 1rem' }}>
              <div style={{ fontWeight: '600', fontSize: '0.9rem', marginBottom: '0.5rem' }}>{c.name}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {c.types.map((t) => (
                  <div key={t.type}>
                    <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)' }}>{typeLabel(t.type)} · {t.count}</div>
                    {t.links.length === 0 ? (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>no link recorded</div>
                    ) : t.links.map((u) => (
                      <a key={u} href={u} target="_blank" rel="noopener noreferrer" title={u} style={{ display: 'block', fontSize: '0.8rem', color: 'var(--primary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        🔗 {u.replace(/^https?:\/\/(www\.)?/, '')}
                      </a>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {reporting && associate.total > 0 && <ReportForm associate={associate} date={date} />}
        </div>
      )}
    </div>
  );
}

export default function AssociateWorkView({ associates, date, today }) {
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
      ) : associates.map((a) => <AssociateCard key={a.id} associate={a} date={date} />)}
    </div>
  );
}
