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
  const [managerIds, setManagerIds] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [screenshot, setScreenshot] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [imageError, setImageError] = useState(null);
  const [selectedClients, setSelectedClients] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  const selectedManagers = managers.filter((m) => managerIds.includes(m.id));
  const toggleManager = (id) => setManagerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleRole = (list) => setManagerIds((prev) => {
    const ids = list.map((m) => m.id);
    return ids.every((id) => prev.includes(id)) ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])];
  });

  // The report has to point at a real client from the roster — same list the
  // Clients Stats page uses — so only an exact (case-insensitive) pick counts.
  const typed = form.client.trim().toLowerCase();
  const clientMatch = clients.find((c) => c.toLowerCase() === typed) || null;
  const addClient = (name) => {
    setSelectedClients((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setForm((prev) => ({ ...prev, client: '' }));
  };
  const removeClient = (name) => setSelectedClients((prev) => prev.filter((c) => c !== name));
  const onClientInput = (e) => {
    const value = e.target.value;
    const exact = clients.find((c) => c.toLowerCase() === value.trim().toLowerCase());
    if (exact) addClient(exact);
    else setForm((prev) => ({ ...prev, client: value }));
  };
  const clientInvalid = !!typed && !clientMatch;
  const clientSuggestions = !clientMatch && typed
    ? clients.filter((c) => c.toLowerCase().includes(typed) && !selectedClients.includes(c)).slice(0, 8)
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
    const result = await submitExecutiveReport({ managerIds, ...form, clients: selectedClients, screenshot });
    setSubmitting(false);
    if (result?.error) {
      setMessage({ type: 'error', text: result.error });
      return;
    }
    setMessage({ type: 'success', text: `${result.count} report${result.count === 1 ? '' : 's'} filed against ${selectedManagers.map((m) => m.name).join(', ')}${selectedClients.length > 1 ? ` (one per client)` : ''}. ${selectedManagers.length === 1 ? "They've" : "They've each"} been notified and have 5 working days (Mon-Fri) to resolve it.` });
    setForm(EMPTY);
    setScreenshot(null);
    setFileKey((k) => k + 1);
    setManagerIds([]);
    setSelectedClients([]);
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
          <label style={labelStyle}>Managers (select one or more)</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {[...byRole.entries()].map(([role, list]) => {
              const allOn = list.every((m) => managerIds.includes(m.id));
              return (
                <div key={role}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>{roleLabels[role] || role}</span>
                    <button type="button" onClick={() => toggleRole(list)} style={{ background: 'none', border: 'none', color: BRAND_COLOR, fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}>
                      {allOn ? 'Clear all' : 'Select all'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {list.map((m) => {
                      const on = managerIds.includes(m.id);
                      return (
                        <label key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem', borderRadius: '2rem', cursor: 'pointer', fontSize: '0.85rem', border: `1.5px solid ${on ? BRAND_COLOR : 'var(--border)'}`, backgroundColor: on ? 'rgba(22, 178, 147, 0.1)' : 'transparent' }}>
                          <input type="checkbox" checked={on} onChange={() => toggleManager(m.id)} style={{ accentColor: 'var(--primary)' }} />
                          {m.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {selectedManagers.length > 0 && (
          <>
            <div style={{ paddingTop: '1.1rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Reporting <strong style={{ color: 'var(--foreground)' }}>{selectedManagers.map((m) => m.name).join(', ')}</strong>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Clients (optional — pick as many as you want)</label>
                  <button type="button" onClick={() => setSelectedClients(selectedClients.length === clients.length ? [] : [...clients])} style={{ background: 'none', border: 'none', color: BRAND_COLOR, fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}>
                    {selectedClients.length === clients.length ? 'Clear all' : 'Select all'}
                  </button>
                </div>
                {selectedClients.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                    {selectedClients.map((c) => (
                      <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.4rem 0.3rem 0.8rem', borderRadius: '2rem', border: `1.5px solid ${BRAND_COLOR}`, backgroundColor: 'rgba(22, 178, 147, 0.1)', fontSize: '0.8rem' }}>
                        {c}
                        <button type="button" onClick={() => removeClient(c)} aria-label={`Remove ${c}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1, padding: '0 0.25rem' }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  list="qa-exec-clients"
                  value={form.client}
                  onChange={onClientInput}
                  maxLength={300}
                  style={inputStyle}
                  placeholder={selectedClients.length ? 'Add another client…' : 'Search or pick a client…'}
                />
                <datalist id="qa-exec-clients">
                  {clients.map((c) => <option key={c} value={c} />)}
                </datalist>
                {clientSuggestions.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                    {clientSuggestions.map((c) => (
                      <button key={c} type="button" onClick={() => addClient(c)} style={{ padding: '0.3rem 0.7rem', borderRadius: '2rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--foreground)', fontSize: '0.75rem', cursor: 'pointer' }}>
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
                  <textarea value={form.url} onChange={set('url')} rows={3} maxLength={5000} style={{ ...inputStyle, resize: 'vertical' }} placeholder="https://... (one link per line — add as many as you need)" />
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                <button
                  type="submit"
                  disabled={submitting || !form.severity || clientInvalid}
                  style={{ padding: '0.7rem 1.6rem', backgroundColor: BRAND_COLOR, color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: '600', fontSize: '0.9rem', cursor: 'pointer', opacity: submitting || !form.severity || clientInvalid ? 0.6 : 1 }}
                >
                  {submitting ? 'Submitting...' : 'Submit report'}
                </button>
              </div>
              {(!form.severity || clientInvalid) && <span style={{ marginLeft: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{clientInvalid ? 'Pick a client from the list (or clear the field)' : 'Pick a severity'} to submit</span>}
            </div>
          </>
        )}
      </form>
    </div>
  );
}
