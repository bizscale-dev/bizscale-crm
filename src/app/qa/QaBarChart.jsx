'use client';

import { SOURCES, formatDay } from './statsUtils';

const W = 760;
const H = 280;
const M = { top: 14, right: 10, bottom: 38, left: 34 };

// Stacked bar chart of issues filed per day/week, one colour per report type.
// Hand-rolled SVG (no chart library in this project) themed with the app's
// CSS variables so it follows light/dark mode.
export default function QaBarChart({ buckets, unit }) {
  const total = buckets.reduce((s, b) => s + b.total, 0);
  if (buckets.length === 0 || total === 0) {
    return (
      <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
        No issues filed in this period.
      </div>
    );
  }

  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const peak = Math.max(...buckets.map((b) => b.total));
  const step = Math.max(1, Math.ceil(peak / 4));
  const yMax = step * 4;
  const slot = innerW / buckets.length;
  const barW = Math.max(3, Math.min(34, slot * 0.68));
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 14));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Issues filed over time">
        {[0, 1, 2, 3, 4].map((i) => {
          const y = M.top + innerH - (innerH * i) / 4;
          return (
            <g key={i}>
              <line x1={M.left} x2={W - M.right} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray={i === 0 ? undefined : '3 4'} />
              <text x={M.left - 6} y={y + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)">{step * i}</text>
            </g>
          );
        })}

        {buckets.map((b, i) => {
          const x = M.left + slot * i + (slot - barW) / 2;
          let yCursor = M.top + innerH;
          const range = unit === 'week' ? `${formatDay(b.from)} – ${formatDay(b.to)}` : formatDay(b.from);
          const tip = `${range}: ${b.total} issue${b.total === 1 ? '' : 's'}` +
            SOURCES.filter((s) => b.counts[s.key]).map((s) => ` · ${s.label} ${b.counts[s.key]}`).join('');
          return (
            <g key={b.from}>
              <title>{tip}</title>
              <rect x={M.left + slot * i} y={M.top} width={slot} height={innerH} fill="transparent" />
              {SOURCES.map((s) => {
                const n = b.counts[s.key] || 0;
                if (!n) return null;
                const h = (n / yMax) * innerH;
                yCursor -= h;
                return <rect key={s.key} x={x} y={yCursor} width={barW} height={h} fill={s.color} rx="2" />;
              })}
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={H - M.bottom + 16} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{b.label}</text>
              )}
            </g>
          );
        })}
      </svg>

      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '0.5rem' }}>
        {SOURCES.map((s) => (
          <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: s.color, display: 'inline-block' }} />
            {s.label}
          </span>
        ))}
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>· issues filed per {unit}</span>
      </div>
    </div>
  );
}
