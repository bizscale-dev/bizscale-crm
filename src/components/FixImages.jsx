// Pictures attached to a fix or a task proof, served by an API route as ?i=0.. (or the plain URL for the
// first one when `plain` is set, which is how task proofs are served).
export default function FixImages({ base, id, count, plain = false, maxHeight = '260px' }) {
  if (!count) return null;
  const urls = Array.from({ length: count }, (_, i) => (plain ? (i === 0 ? `${base}/${id}` : `${base}/${id}?i=${i}`) : `${base}/${id}?i=${i}`));
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
      {urls.map((u, i) => (
        <a key={u} href={u} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt={`Picture ${i + 1}`} loading="lazy" style={{ display: 'block', maxHeight, maxWidth: '100%', borderRadius: '0.5rem', border: '1px solid var(--border)' }} />
        </a>
      ))}
    </div>
  );
}
