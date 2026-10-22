'use client';

import { SOURCES, monthRange, lastNDays } from './statsUtils';

export const labelStyle = {
  display: 'block',
  marginBottom: '0.4rem',
  fontSize: '0.75rem',
  fontWeight: '600',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
};

export const inputStyle = {
  padding: '0.6rem 0.85rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: '0.9rem',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

export const quickBtn = (active) => ({
  padding: '0.45rem 0.85rem',
  borderRadius: '2rem',
  border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
  backgroundColor: active ? 'rgba(22, 178, 147, 0.12)' : 'transparent',
  color: active ? 'var(--primary)' : 'var(--text-muted)',
  fontSize: '0.78rem',
  fontWeight: '600',
  cursor: 'pointer',
});

// From/To date inputs plus one-click presets (this month, last month, last
// 30 days, optionally all time).
export function DateRangeControls({ from, to, setFrom, setTo, today, allowAllTime }) {
  const thisMonth = monthRange(today, 0);
  const lastMonth = monthRange(today, -1);
  const last30 = lastNDays(today, 30);
  const is = (r) => from === r.from && to === r.to;

  const apply = (r) => { setFrom(r.from); setTo(r.to); };

  return (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div>
        <label style={labelStyle}>From</label>
        <input type="date" className="date-input-brand" value={from} onChange={(e) => setFrom(e.target.value)} onClick={(e) => e.target.showPicker?.()} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>To</label>
        <input type="date" className="date-input-brand" value={to} onChange={(e) => setTo(e.target.value)} onClick={(e) => e.target.showPicker?.()} style={inputStyle} />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingBottom: '0.1rem' }}>
        <button type="button" style={quickBtn(is(thisMonth))} onClick={() => apply(thisMonth)}>This month</button>
        <button type="button" style={quickBtn(is(lastMonth))} onClick={() => apply(lastMonth)}>Last month</button>
        <button type="button" style={quickBtn(is(last30))} onClick={() => apply(last30)}>Last 30 days</button>
        {allowAllTime && (
          <button type="button" style={quickBtn(!from && !to)} onClick={() => { setFrom(''); setTo(''); }}>All time</button>
        )}
      </div>
    </div>
  );
}

const STATUS_STYLES = {
  open: { label: 'Open', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
  overdue: { label: 'Overdue', color: 'var(--danger)', bg: 'rgba(239, 68, 68, 0.12)' },
  review: { label: 'Awaiting QA', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' },
  resolved: { label: 'Resolved', color: 'var(--success)', bg: 'rgba(34, 197, 94, 0.12)' },
};

export function StatusChip({ status }) {
  const s = STATUS_STYLES[status];
  return (
    <span style={{ fontSize: '0.7rem', fontWeight: '700', color: s.color, backgroundColor: s.bg, padding: '0.2rem 0.6rem', borderRadius: '1rem', whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

export function TypeTag({ source }) {
  const s = SOURCES.find((x) => x.key === source) || SOURCES[0];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
      <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: s.color }} />
      {s.label}
    </span>
  );
}

export function formatResolveTime(days) {
  if (days === null) return '—';
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
  return `${days.toFixed(1)}d`;
}

export const th = { padding: '0.6rem 0.75rem 0.6rem 0', textAlign: 'left', fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.02em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
export const td = { padding: '0.7rem 0.75rem 0.7rem 0', fontSize: '0.82rem', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };
