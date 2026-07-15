export default function StatCard({ title, value, sub, color = 'var(--primary)' }) {
  return (
    <div className="card" style={{ borderLeft: `4px solid ${color}` }}>
      <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
        {title}
      </h3>
      <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  );
}
