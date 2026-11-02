'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateQaReport } from './actions';

const SEVERITIES = [
  { value: 'high', label: 'High', color: 'var(--danger)' },
  { value: 'medium', label: 'Medium', color: '#f59e0b' },
  { value: 'low', label: 'Low', color: 'var(--success)' },
];

const inputStyle = {
  width: '100%',
  padding: '0.55rem 0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: '0.85rem',
  fontFamily: 'inherit',
};

const labelStyle = { display: 'block', fontSize: '0.72rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase' };

// Lets QA correct a report after filing it: the note, the resolve-within days and — on manual
// reports — severity, location, issue, department and links.
export default function EditReportButton({ report }) {
  const router = useRouter();
  const isManual = report.source === 'manual';
  const initial = () => ({
    note: report.note || '',
    resolveDays: String(report.resolve_days || 5),
    severity: report.severity || '',
    location: report.location || '',
    issue: report.issue || '',
    department: report.department || '',
    url: report.page_url || '',
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const openForm = () => { setForm(initial()); setError(null); setOpen(true); };

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await updateQaReport(report.id, form);
    setBusy(false);
    if (res?.error) { setError(res.error); return; }
    setOpen(false);
    router.refresh();
  };

  if (!open) {
    return (
      <div style={{ marginTop: '0.75rem' }}>
        <button
          type="button"
          onClick={openForm}
          style={{ padding: '0.35rem 0.9rem', backgroundColor: 'transparent', border: '1px solid var(--primary)', color: 'var(--primary)', borderRadius: '0.5rem', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' }}
        >
          Edit report
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '0.75rem', width: '100%', padding: '1rem', border: '1px solid var(--primary)', borderRadius: '0.6rem', backgroundColor: 'var(--background)' }}>
      <div style={{ fontWeight: '600', fontSize: '0.9rem', marginBottom: '0.75rem' }}>Edit report</div>

      <div style={{ marginBottom: '0.75rem' }}>
        <label style={labelStyle}>{isManual ? 'Description' : 'Note'}</label>
        <textarea value={form.note} onChange={set('note')} rows={4} maxLength={isManual ? 3000 : 2000} style={{ ...inputStyle, resize: 'vertical' }} />
      </div>

      {isManual && (
        <>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={labelStyle}>Severity</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {SEVERITIES.map((s) => {
                const active = form.severity === s.value;
                return (
                  <button key={s.value} type="button" onClick={() => setForm((f) => ({ ...f, severity: s.value }))}
                    style={{ padding: '0.35rem 1rem', borderRadius: '2rem', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', border: `1px solid ${s.color}`, color: active ? 'white' : s.color, backgroundColor: active ? s.color : 'transparent' }}>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Location</label>
              <input value={form.location} onChange={set('location')} maxLength={300} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Issue</label>
              <input value={form.issue} onChange={set('issue')} maxLength={500} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Department</label>
              <input value={form.department} onChange={set('department')} maxLength={100} style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={labelStyle}>Link(s) — one per line</label>
            <textarea value={form.url} onChange={set('url')} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
        </>
      )}

      <div style={{ marginBottom: '0.9rem', maxWidth: '200px' }}>
        <label style={labelStyle}>Manager must resolve within (working days)</label>
        <input type="number" min={1} max={365} value={form.resolveDays} onChange={set('resolveDays')} style={inputStyle} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={save} disabled={busy}
          style={{ padding: '0.45rem 1.2rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: '600', fontSize: '0.82rem', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy}
          style={{ padding: '0.45rem 1rem', backgroundColor: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '0.5rem', fontSize: '0.82rem', cursor: 'pointer' }}>
          Cancel
        </button>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>The manager is notified of the change.</span>
        {error && <span style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>{error}</span>}
      </div>
    </div>
  );
}
