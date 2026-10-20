// Shows a block of text that may hold several links. When it has two or more
// URLs, every link goes on its own line (a list) instead of running together
// as one paragraph; any non-link text stays as its own line. A single link or
// plain text renders as before. Pure presentation, no hooks.
const URL_PATTERN = /((?:https?:\/\/|www\.)[^\s<>"]+)/g;

function LinkLine({ text }) {
  const parts = text.split(URL_PATTERN);
  return parts.map((part, i) => {
    if (i % 2 === 0) return part;
    const [, url, trailing] = part.match(/^(.*?)([.,;:!?)\]]*)$/);
    return (
      <span key={i}>
        <a
          href={url.startsWith('www.') ? `https://${url}` : url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--primary)', wordBreak: 'break-all', textDecoration: 'none' }}
        >
          {url}
        </a>
        {trailing}
      </span>
    );
  });
}

export default function LinkList({ text, style }) {
  if (!text) return null;
  const value = String(text);
  const urlCount = (value.match(URL_PATTERN) || []).length;

  if (urlCount < 2) {
    return <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...style }}><LinkLine text={value} /></div>;
  }

  // Break onto one link per line: split before every URL, drop empty bits.
  const lines = value
    .split(/[\s,;]+(?=(?:https?:\/\/|www\.))|\n+/)
    .map((l) => l.trim().replace(/[,;]+$/, ''))
    .filter(Boolean);

  return (
    <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem', ...style, margin: style?.margin ?? 0, marginBottom: style?.marginBottom ?? 0 }}>
      {lines.map((line, i) => (
        <li key={i} style={{ wordBreak: 'break-word' }}><LinkLine text={line} /></li>
      ))}
    </ul>
  );
}
