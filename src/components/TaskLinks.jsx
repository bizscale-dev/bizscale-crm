// URLs the sheet sync attached to a task when it was marked done (see syncedClientLinks.js).
export default function TaskLinks({ links }) {
  if (!links || links.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.4rem' }}>
      {links.map((url) => (
        <a key={url} href={url} target="_blank" rel="noopener noreferrer" title={url}
          style={{ fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '260px' }}>
          🔗 {url.replace(/^https?:\/\/(www\.)?/, '')}
        </a>
      ))}
    </div>
  );
}
