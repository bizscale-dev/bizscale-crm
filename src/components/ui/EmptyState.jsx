export default function EmptyState({ message, tone = 'muted' }) {
  const color = tone === 'danger' ? 'var(--danger)' : 'var(--text-muted)';
  return <p style={{ color, margin: 0 }}>{message}</p>;
}
