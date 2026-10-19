'use client';

import { useMemo, useState } from 'react';
import { cardStyle, StatPill } from '../qaStyles';
import QaBarChart from '../QaBarChart';
import Linkify from '../Linkify';
import QaManualDetails, { SeverityBadge } from '@/components/QaManualDetails';
import { DateRangeControls, StatusChip, formatResolveTime, labelStyle, inputStyle, th, td } from '../QaStatsShared';
import { bucketize, filedDate, formatDay, inRange, parseUtc, statusOf, summarize } from '../statsUtils';

const norm = (s) => String(s || '').trim().toLowerCase();

export default function ClientsStatsView({ reports, clients, today }) {
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [nowMs] = useState(() => Date.now());

  // Everything selectable: the full SEO client roster, plus any name that has
  // actually been flagged (older/renamed clients and web-SEO sites that no
  // longer — or never — appear in the roster).
  const names = useMemo(() => {
    const seen = new Map();
    for (const c of clients) if (!seen.has(norm(c))) seen.set(norm(c), c);
    for (const r of reports) if (!seen.has(norm(r.web_client_name))) seen.set(norm(r.web_client_name), r.web_client_name.trim());
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [clients, reports]);

  const selected = names.find((n) => norm(n) === norm(query)) || null;
  const suggestions = !selected && query.trim()
    ? names.filter((n) => norm(n).includes(norm(query))).slice(0, 8)
    : [];

  const inPeriod = useMemo(() => reports.filter((r) => inRange(filedDate(r), from, to)), [reports, from, to]);

  // Most-flagged clients in the period — shown until one is picked.
  const topClients = useMemo(() => {
    const map = new Map();
    for (const r of inPeriod) {
      const k = norm(r.web_client_name);
      if (!map.has(k)) map.set(k, { name: r.web_client_name.trim(), total: 0, open: 0, lastFiled: '' });
      const c = map.get(k);
      c.total += 1;
      if (r.status === 'open') c.open += 1;
      const d = filedDate(r);
      if (d > c.lastFiled) c.lastFiled = d;
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 10);
  }, [inPeriod]);

  const clientReports = useMemo(
    () => (selected ? inPeriod.filter((r) => norm(r.web_client_name) === norm(selected)) : []),
    [inPeriod, selected]
  );
  const summary = useMemo(() => summarize(clientReports, nowMs), [clientReports, nowMs]);
  const { buckets, unit } = useMemo(() => bucketize(clientReports, from, to), [clientReports, from, to]);
  const managersInvolved = new Set(clientReports.map((r) => r.manager_id)).size;
  const sorted = [...clientReports].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const byManager = useMemo(() => {
    const map = new Map();
    for (const r of clientReports) {
      if (!map.has(r.manager_id)) map.set(r.manager_id, { name: r.manager_name, total: 0, open: 0 });
      const m = map.get(r.manager_id);
      m.total += 1;
      if (r.status === 'open') m.open += 1;
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [clientReports]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.35rem' }}>Clients Stats</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          Pick a client to see every issue QA has raised on their work in the EODs — who filed it, what was wrong,
          and whether it&apos;s been resolved. Narrow it down with dates.
        </p>
      </div>

      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
        <div style={{ maxWidth: '420px' }}>
          <label style={labelStyle}>Client</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              list="qa-client-names"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or pick a client…"
              style={{ ...inputStyle, flex: 1 }}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} style={{ padding: '0 0.9rem', border: '1px solid var(--border)', borderRadius: '0.5rem', background: 'transparent', color: 'var(--foreground)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}>
                Clear
              </button>
            )}
          </div>
          <datalist id="qa-client-names">
            {names.map((n) => <option key={n} value={n} />)}
          </datalist>
          {suggestions.length > 0 && (
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
              {suggestions.map((n) => (
                <button key={n} type="button" onClick={() => setQuery(n)} style={{ padding: '0.3rem 0.7rem', borderRadius: '2rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--foreground)', fontSize: '0.75rem', cursor: 'pointer' }}>
                  {n}
                </button>
              ))}
            </div>
          )}
          {!selected && query.trim() && suggestions.length === 0 && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>No client matches “{query}”.</div>
          )}
        </div>
        <DateRangeControls from={from} to={to} setFrom={setFrom} setTo={setTo} today={today} allowAllTime />
      </div>

      {!selected ? (
        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.05rem', margin: '0 0 1rem' }}>Most flagged clients{from || to ? ' in this period' : ''}</h2>
          {topClients.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', margin: 0, textAlign: 'center', padding: '1rem 0' }}>
              No client issues filed{from || to ? ' in this period' : ' yet'}. Flag an EOD link from the EOD page and it will show up here.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['Client', 'Issues', 'Open', 'Last filed'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {topClients.map((c) => (
                    <tr key={c.name} onClick={() => setQuery(c.name)} style={{ cursor: 'pointer' }}>
                      <td style={td}><strong>{c.name}</strong></td>
                      <td style={td}>{c.total}</td>
                      <td style={{ ...td, color: c.open ? '#f59e0b' : undefined }}>{c.open}</td>
                      <td style={td}>{formatDay(c.lastFiled)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0.75rem 0 0' }}>Click a client to see their issues.</p>
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <StatPill label="Issues raised" value={summary.total} color="var(--primary)" />
            <StatPill label="Open" value={summary.open} color="#f59e0b" />
            <StatPill label="Overdue" value={summary.overdue} color="var(--danger)" />
            <StatPill label="Resolved" value={summary.resolved} color="var(--success)" />
            <StatPill label="Managers involved" value={managersInvolved} color="var(--foreground)" />
            <StatPill label="Avg. time to resolve" value={formatResolveTime(summary.avgResolveDays)} color="var(--foreground)" />
          </div>

          <div style={cardStyle}>
            <h2 style={{ fontSize: '1.05rem', margin: '0 0 1rem' }}>Issues over time — {selected}</h2>
            <QaBarChart buckets={buckets} unit={unit} />
          </div>

          {byManager.length > 0 && (
            <div style={cardStyle}>
              <h2 style={{ fontSize: '1.05rem', margin: '0 0 1rem' }}>By manager</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                {byManager.map((m) => (
                  <div key={m.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.25rem' }}>
                      <span>{m.name}</span>
                      <span><strong>{m.total}</strong> <span style={{ color: 'var(--text-muted)' }}>· {m.open} open</span></span>
                    </div>
                    <div style={{ height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${(m.total / byManager[0].total) * 100}%`, height: '100%', backgroundColor: 'var(--primary)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Issues raised on {selected}</h2>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{sorted.length} total</span>
            </div>
            {sorted.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', margin: 0, textAlign: 'center', padding: '1rem 0' }}>
                No issues raised on this client{from || to ? ' in this period' : ''}.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {sorted.map((r) => (
                  <div key={r.id} style={{ padding: '0.9rem 1rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '0.6rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.5rem' }}>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Filed {formatDay(filedDate(r))} · {r.source === 'manual' ? 'Manual report' : `EOD of ${r.report_date}`} · <strong style={{ color: 'var(--foreground)' }}>{r.manager_name}</strong> · by {r.filed_by}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {r.source === 'manual' && <SeverityBadge severity={r.severity} />}
                        <StatusChip status={statusOf(r, nowMs)} />
                      </div>
                    </div>
                    {r.page_url && (
                      <a href={r.page_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: '0.78rem', color: 'var(--primary)', wordBreak: 'break-all', textDecoration: 'none', marginBottom: '0.4rem' }}>
                        {r.page_url}
                      </a>
                    )}
                    {r.work_done && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', whiteSpace: 'pre-wrap' }}><Linkify text={r.work_done} /></div>
                    )}
                    {r.source === 'manual' && <QaManualDetails report={r} />}
                    <div style={{ padding: '0.6rem 0.85rem', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', borderLeft: '3px solid #f59e0b', borderRadius: '0.4rem', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
                      <Linkify text={r.note} />
                    </div>
                    {r.status === 'resolved' && (
                      <div style={{ marginTop: '0.5rem', padding: '0.6rem 0.85rem', backgroundColor: 'rgba(34, 197, 94, 0.06)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '0.4rem', fontSize: '0.82rem', whiteSpace: 'pre-wrap' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: '700', color: 'var(--success)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                          Resolved {parseUtc(r.resolved_at).toLocaleDateString()}
                        </div>
                        <Linkify text={r.resolution_note} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
