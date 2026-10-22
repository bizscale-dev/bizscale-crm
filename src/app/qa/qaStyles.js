import Link from 'next/link';
// Shared visual language across the 3 HR pages — not reused outside /hr,
// so a local module here is simpler than threading props through 3
// independent view components for the same handful of style objects.
export const BRAND_COLOR = 'var(--primary)';

export const cardStyle = {
  backgroundColor: 'var(--card-bg)',
  border: '1px solid var(--border)',
  borderRadius: '0.75rem',
  padding: '1.5rem',
};

export const selectStyle = {
  padding: '0.6rem 0.9rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: '0.875rem',
  minWidth: '200px',
};

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function formatMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

// With an href the pill is a link (e.g. a filter); `active` highlights the current one.
export function StatPill({ label, value, color, href, active }) {
  const pill = (
    <div style={{
      padding: '1rem 1.25rem', backgroundColor: active ? 'var(--card-bg)' : 'var(--background)',
      border: `1px solid ${active ? (color || 'var(--primary)') : 'var(--border)'}`,
      boxShadow: active ? `0 0 0 1px ${color || 'var(--primary)'}` : 'none',
      borderRadius: '0.6rem', flex: href ? undefined : '1', minWidth: '140px', height: '100%', boxSizing: 'border-box',
      cursor: href ? 'pointer' : undefined,
    }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: '700', color: color || 'var(--foreground)' }}>{value}</div>
    </div>
  );
  if (!href) return pill;
  return <Link href={href} style={{ flex: '1', minWidth: '140px', textDecoration: 'none', color: 'inherit' }}>{pill}</Link>;
}
