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

export function StatPill({ label, value, color }) {
  return (
    <div style={{ padding: '1rem 1.25rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '0.6rem', flex: '1', minWidth: '140px' }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: '700', color: color || 'var(--foreground)' }}>{value}</div>
    </div>
  );
}
