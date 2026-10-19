'use client';

import { useState } from 'react';
import { submitExecutiveReport } from './actions';

const BRAND_COLOR = 'var(--primary)';
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const SEVERITIES = [
  { value: 'high', label: 'High', color: 'var(--danger)', bg: 'rgba(239, 68, 68, 0.12)' },
  { value: 'medium', label: 'Medium', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
  { value: 'low', label: 'Low', color: 'var(--success)', bg: 'rgba(34, 197, 94, 0.12)' },
];

const cardStyle = {
  backgroundColor: 'var(--card-bg)',
  border: '1px solid var(--border)',
  borderRadius: '0.75rem',
  padding: '1.5rem',
};

const labelStyle = {
  display: 'block',
  marginBottom: '0.4rem',
  fontSize: '0.75rem',
  fontWeight: '600',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
};

const inputStyle = {
  width: '100%',
  padding: '0.6rem 0.85rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: '0.9rem',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const EMPTY = { client: '', description: '', location: '', url: '', issue: '', department: '', severity: '' };

export default function ExecutiveReportForm({ managers, clients, roleLabels }) {
  const [managerId, setManagerId] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [screenshot, setScreenshot] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [imageError, setImageError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  const selectedManager = managers.find((m) => String(m.id) === managerId);

  // The report has to point at a real client from the roster — same list the
  // Clients Stats page uses — so only an exact (case-insensitive) pick counts.
  const typed = form.client.trim().toLowerCase();
  const clientMatch = clients.find((c) => c.toLowerCase() === typed) || null;
  const clientSuggestions = !clientMatch && typed
    ? clients.filter((c) => c.toLowerCase().includes(typed)).slice(0, 8)
    : [];

  const byRole = new Map();
  for (const m of managers) {
    if (!byRole.has(m.role)) byRole.set(m.role, []);
    byRole.get(m.role).push(m);
  }

  const handleFile = (e) => {
    setImageError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setScreenshot(null);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('Image is too large — max 2MB.');
      e.target.value = '';
      setScreenshot(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setScreenshot(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const result = await submitExecutiveReport({ managerId, ...form, screenshot });
    setSubmitting(false);
    if (result?.error) {
      setMessage({ type: 'error', text: result.error });
      return;
    }
    setMessage({ type: 'success', text: `Report filed against ${selectedManager?.name}. They've been notified and have 5 days to resolve it.` });
    setForm(EMPTY);
    setScreenshot(null);
    setFileKey((k) => k + 1);
    setManagerId('');
  };

  return (
    <div style={cardStyle}>
      {message && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '1.25rem', fontSize: '0.875rem',
          backgroundColor: message.type === 'error' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(22, 178, 147, 0.1)',
          color: message.type === 'error' ? 'var(--danger)' : 'var(--success)',
        }}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
        <div>
          <label style={labelStyle}>Manager</label>
          <select value={managerId} onChange={(e) => setManagerId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }} required>
            <option value="">Select a manager…</option>
            {[...byRole.entries()].map(([role, list]) => (
              <optgroup key={role} label={roleLabels[role] || role}>
                {list.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>

        {selectedManager && (
          <>
            <div style={{ paddingTop: '1.1rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Reporting <strong style={{ color: 'var(--foreground)' }}>{selectedManager.name}</strong>
              </div>

              <div>
                <label style={labelStyle}>Client</label>
                <input
                  list="qa-exec-clients"
                  value={form.client}
                  onChange={set('client')}
                  maxLength={300}
                  required
                  style={{ ...inputStyle, borderColor: clientMatch ? BRAND_COLOR : 'var(--border)' }}
                  placeholder="Search or pick the client this is about…"
                />
                <datalist id="qa-exec-clients">
                  {clients.map((c) => <option key={c} value={c} />)}
                </datalist>
                {clientSuggestions.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                    {clientSuggestions.map((c) => (
                      <button key={c} type="button" onClick={() => setForm((prev) => ({ ...prev, client: c }))} style={{ padding: '0.3rem 0.7rem', borderRadius: '2rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--foreground)', fontSize: '0.75rem', cursor: 'pointer' }}>
                        {c}
                      </button>
                    ))}
                  </div>
                )}
                {!clientMatch && typed && clientSuggestions.length === 0 && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>No client matches “{form.client}”.</div>
                )}
              </div>

              <div>
                <label style={labelStyle}>Description</label>
                <textarea value={form.description} onChange={set('description')} rows={4} required style={{ ...inputStyle, resize: 'vertical' }} placeholder="Describe what's wrong in detail..." />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.1rem' }}>
                <div>
                  <label style={labelStyle}>Location</label>
                  <input type="text" value={form.location} onChange={set('location')} maxLength={300} style={inputStyle} placeholder="Where — page, section, tool..." />
                </div>
                <div>
                  <label style={labelStyle}>URL</label>
                  <input type="text" value={form.url} onChange={set('url')} maxLength={1000} style={inputStyle} placeholder="https://..." />
                </div>
                <div>
                  <label style={labelStyle}>Issue</label>
                  <input type="text" value={form.issue} onChange={set('issue')} maxLength={500} style={inputStyle} placeholder="Type of issue — e.g. broken link, wrong content" />
                </div>
                <div>
                  <label style={labelStyle}>Department</label>
                  <input type="text" value={form.department} onChange={set('department')} maxLength={100} style={inputStyle} placeholder="e.g. SEO, Web SEO, Writing" />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Severity</label>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  {SEVERITIES.map((s) => {
                    const active = form.severity === s.value;
                    return (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, severity: s.value }))}
                        style={{
                          padding: '0.5rem 1.25rem', borderRadius: '2rem', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem',
                          border: `1.5px solid ${active ? s.color : 'var(--border)'}`,
                          backgroundColor: active ? s.bg : 'transparent',
                          color: active ? s.color : 'var(--text-muted)',
                        }}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Screenshot (optional)</label>
                <input key={fileKey} type="file" accept="image/*" onChange={handleFile} />
                {imageError && <div style={{ fontSize: '0.8rem', color: 'var(--danger)', marginTop: '0.35rem' }}>{imageError}</div>}
                {screenshot && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={screenshot} alt="Preview" style={{ maxWidth: '100%', maxHeight: '220px', marginTop: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border)', display: 'block' }} />
                )}
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={submitting || !form.severity || !clientMatch}
                style={{ padding: '0.7rem 1.6rem', backgroundColor: BRAND_COLOR, color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: '600', fontSize: '0.9rem', cursor: 'pointer', opacity: submitting || !form.severity || !clientMatch ? 0.6 : 1 }}
              >
                {submitting ? 'Submitting...' : 'Submit report'}
              </button>
              {(!form.severity || !clientMatch) && <span style={{ marginLeft: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{!clientMatch ? 'Pick a client from the list' : 'Pick a severity'} to submit</span>}
            </div>
          </>
        )}
      </form>
    </div>
  );
}
