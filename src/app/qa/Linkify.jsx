// Turns any http(s):// or www. URLs inside free text into real clickable
// links (opening in a new tab) — EOD descriptions and task text are typed
// by hand and routinely contain pasted links QA needs to click through.
// Trailing punctuation ("see https://x.com.") stays outside the link.
const URL_PATTERN = /((?:https?:\/\/|www\.)[^\s<>"]+)/g;

export default function Linkify({ text, linkStyle }) {
  if (!text) return null;
  const parts = String(text).split(URL_PATTERN);

  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const [, url, trailing] = part.match(/^(.*?)([.,;:!?)\]]*)$/);
        const href = url.startsWith('www.') ? `https://${url}` : url;
        return (
          <span key={i}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--primary)', wordBreak: 'break-all', ...linkStyle }}
            >
              {url}
            </a>
            {trailing}
          </span>
        );
      })}
    </>
  );
}
