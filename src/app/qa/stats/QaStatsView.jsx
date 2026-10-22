'use client';

import { useMemo, useState } from 'react';
import { cardStyle, StatPill } from '../qaStyles';
import QaBarChart from '../QaBarChart';
import { DateRangeControls, quickBtn, StatusChip, TypeTag, formatResolveTime, labelStyle, inputStyle, th, td } from '../QaStatsShared';
import { SOURCES, bucketize, filedDate, formatDay, inRange, monthRange, statusOf, summarize } from '../statsUtils';

const ROLE_LABELS = {
  web_seo_manager: 'Web SEO Managers',
  seo_manager: 'SEO Managers',
  writers_manager: 'Writers Managers',
};
const SEVERITY_COLORS = { high: 'var(--danger)', medium: '#f59e0b', low: 'var(--success)' };
const LIST_CAP = 100;

function subjectOf(r) {
  if (r.source === 'manual') return r.title || r.web_client_name || 'Manual report';
  if (r.source === 'manager_task') return `Task: ${(r.work_done || '').slice(0, 80)}`;
  return r.web_client_name;
}

export default function QaStatsView({ reports, managers, today }) {
  const [managerId, setManagerId] = useState('');
  const initial = monthRange(today, 0);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [nowMs] = useState(() => Date.now());

  const filtered = useMemo(
    () => reports.filter((r) => (!managerId || String(r.manager_id) === managerId) && inRange(filedDate(r), from, to)),
    [reports, managerId, from, to]
  );
  const summary = useMemo(() => summarize(filtered, nowMs), [filtered, nowMs]);
  const { buckets, unit } = useMemo(() => bucketize(filtered, from, to), [filtered, from, to]);

  const byManager = useMemo(() => {
    const map = new Map();
    for (const r of filtered) {
      if (!map.has(r.manager_id)) map.set(r.manager_id, { id: r.manager_id, name: r.manager_name, role: r.manager_role, total: 0, open: 0, overdue: 0, resolved: 0 });
      const m = map.get(r.manager_id);
      m.total += 1;
      const st = statusOf(r, nowMs);
      if (st === 'resolved') m.resolved += 1; else { m.open += 1; if (st === 'overdue') m.overdue += 1; }
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [filtered, nowMs]);

  const byRole = new Map();
  for (const m of managers) {
    if (!byRole.has(m.role)) byRole.set(m.role, []);
    byRole.get(m.role).push(m);
  }
  const selected = managers.find((m) => String(m.id) === managerId);
  const sorted = [...filtered].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.35rem' }}>Stats</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          Issues QA has raised, by month. Pick a manager (or leave it on everyone) and set the dates to see
          how many were filed, how fast they got resolved, and how it trended.
        </p>
      </div>

      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
        <div>
          <label style={labelStyle}>Manager</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" style={quickBtn(!managerId)} onClick={() => setManagerId('')}>All managers</button>
            </div>
            {[...byRole.entries()].map(([role, list]) => (
              <div key={role} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', minWidth: '7.5rem' }}>{ROLE_LABELS[role] || role}</span>
                {list.map((m) => (
                  <button key={m.id} type="button" style={quickBtn(managerId === String(m.id))} onClick={() => setManagerId(String(m.id))}>{m.name}</button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <DateRangeControls from={from} to={to} setFrom={setFrom} setTo={setTo} today={today} allowAllTime />
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <StatPill label="Issues filed" value={summary.total} color="var(--primary)" />
        <StatPill label="Open" value={summary.open} color="#f59e0b" />
        <StatPill label="Overdue" value={summary.overdue} color="var(--danger)" />
        <StatPill label="Resolved" value={summary.resolved} color="var(--success)" />
        <StatPill label="Avg. time to resolve" value={formatResolveTime(summary.avgResolveDays)} color="var(--foreground)" />
        <StatPill label="Resolved on time" value={summary.onTimePct === null ? '—' : `${summary.onTimePct}%`} color="var(--foreground)" />
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Issues in this period</h2>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {sorted.length > LIST_CAP ? `Latest ${LIST_CAP} of ${sorted.length}` : `${sorted.length} total`}
          </span>
        </div>
        {sorted.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', margin: 0, textAlign: 'center', padding: '1rem 0' }}>Nothing filed in this period.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['Filed', !managerId && 'Manager', 'Type', 'About', 'Note', 'Status'].filter(Boolean).map((h) => <th key={h} style={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {sorted.slice(0, LIST_CAP).map((r) => (
                  <tr key={r.id}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{formatDay(filedDate(r))}</td>
                    {!managerId && <td style={td}>{r.manager_name}</td>}
                    <td style={td}><TypeTag source={r.source} />{r.severity && <div style={{ fontSize: '0.68rem', color: SEVERITY_COLORS[r.severity], textTransform: 'uppercase', fontWeight: '700', marginTop: '0.15rem' }}>{r.severity}</div>}</td>
                    <td style={{ ...td, maxWidth: '220px', wordBreak: 'break-word' }}>{subjectOf(r)}</td>
                    <td style={{ ...td, maxWidth: '320px', color: 'var(--text-muted)', wordBreak: 'break-word' }}>{r.note.length > 140 ? `${r.note.slice(0, 140)}…` : r.note}</td>
                    <td style={td}><StatusChip status={statusOf(r, nowMs)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.05rem', margin: '0 0 1rem' }}>By type</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            {SOURCES.map((s) => {
              const n = summary.bySource[s.key] || 0;
              const pct = summary.total ? (n / summary.total) * 100 : 0;
              return (
                <div key={s.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.25rem' }}>
                    <span>{s.label}</span><strong>{n}</strong>
                  </div>
                  <div style={{ height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', backgroundColor: s.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.3rem' }}>Severity</h2>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 1rem' }}>Manual reports only — EOD and task flags don&apos;t carry a severity.</p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {['high', 'medium', 'low'].map((k) => (
              <div key={k} style={{ flex: 1, padding: '0.75rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '0.5rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: '700', color: SEVERITY_COLORS[k] }}>{summary.bySeverity[k]}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '0.15rem' }}>{k}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!managerId && byManager.length > 0 && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.05rem', margin: '0 0 1rem' }}>By manager</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['Manager', 'Issues', 'Open', 'Overdue', 'Resolved'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {byManager.map((m) => (
                  <tr key={m.id} onClick={() => setManagerId(String(m.id))} style={{ cursor: 'pointer' }}>
                    <td style={td}><strong>{m.name}</strong> <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>· {(ROLE_LABELS[m.role] || m.role).replace(/s$/, '')}</span></td>
                    <td style={td}>{m.total}</td>
                    <td style={{ ...td, color: m.open ? '#f59e0b' : undefined }}>{m.open}</td>
                    <td style={{ ...td, color: m.overdue ? 'var(--danger)' : undefined }}>{m.overdue}</td>
                    <td style={{ ...td, color: 'var(--success)' }}>{m.resolved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0.75rem 0 0' }}>Click a manager to drill into their issues.</p>
        </div>
      )}

      <div style={cardStyle}>
        <h2 style={{ fontSize: '1.05rem', margin: '0 0 1rem' }}>
          Issues over time{selected ? ` — ${selected.name}` : ''}
        </h2>
        <QaBarChart buckets={buckets} unit={unit} />
      </div>
    </div>
  );
}
