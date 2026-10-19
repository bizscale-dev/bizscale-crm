// Shared by the manager's Reports page and QA's Reports page: the structured
// fields of a manual (Executives) QA report. Pure presentation, no hooks.
export const SEVERITY_STYLES = {
  high: { label: 'High', color: 'var(--danger)', bg: 'rgba(239, 68, 68, 0.12)' },
  medium: { label: 'Medium', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
  low: { label: 'Low', color: 'var(--success)', bg: 'rgba(34, 197, 94, 0.12)' },
};

export function SeverityBadge({ severity }) {
  const s = SEVERITY_STYLES[severity];
  if (!s) return null;
  return (
    <span style={{ fontSize: '0.7rem', fontWeight: '700', color: s.color, backgroundColor: s.bg, padding: '0.2rem 0.6rem', borderRadius: '1rem', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
      {s.label} severity
    </span>
  );
}

export default function QaManualDetails({ report }) {
  const fields = [
    ['Location', report.location],
    ['Issue', report.issue],
    ['Department', report.department],
  ].filter(([, value]) => value);

  if (fields.length === 0 && !report.screenshot_base64) return null;

  return (
    <>
      {fields.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem', marginBottom: '0.75rem' }}>
          {fields.map(([label, value]) => (
            <div key={label} style={{ padding: '0.55rem 0.75rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '0.5rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.15rem' }}>{label}</div>
              <div style={{ fontSize: '0.82rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value}</div>
            </div>
          ))}
        </div>
      )}
      {report.screenshot_base64 && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={report.screenshot_base64}
          alt="Screenshot"
          style={{ maxWidth: '100%', maxHeight: '340px', borderRadius: '0.5rem', border: '1px solid var(--border)', marginBottom: '0.75rem', display: 'block' }}
        />
      )}
    </>
  );
}
