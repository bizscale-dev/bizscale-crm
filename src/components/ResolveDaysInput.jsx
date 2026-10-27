'use client';

// QA picks how many working days the manager gets to resolve a report.
// Left blank, the server falls back to the 5-day default.
export default function ResolveDaysInput({ value, onChange, labelStyle, inputStyle }) {
  return (
    <div>
      <label style={labelStyle}>Days to resolve (optional)</label>
      <input
        type="number"
        min={1}
        max={365}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="5"
        style={{ ...inputStyle, width: '8rem' }}
      />
      <span style={{ marginLeft: '0.6rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>working days (Sat/Sun excluded) — blank = 5</span>
    </div>
  );
}
