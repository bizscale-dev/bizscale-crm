'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitEodReport } from './actions';

const BRAND_COLOR = 'var(--primary)';

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

const primaryButtonStyle = {
  padding: '0.65rem 1.35rem',
  backgroundColor: BRAND_COLOR,
  color: 'white',
  border: 'none',
  borderRadius: '0.5rem',
  cursor: 'pointer',
  fontWeight: '600',
  fontSize: '0.875rem',
};

const secondaryButtonStyle = {
  padding: '0.65rem 1.35rem',
  backgroundColor: 'transparent',
  color: 'var(--foreground)',
  border: '1px solid var(--border)',
  borderRadius: '0.5rem',
  cursor: 'pointer',
  fontWeight: '600',
  fontSize: '0.875rem',
};

export default function EodReportClient({ webClients, history, today, hasCampaign }) {
  const router = useRouter();

  // 'select' -> pick a web client, 'details' -> fill in work done + description
  const [step, setStep] = useState('select');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [workDone, setWorkDone] = useState('');
  const [description, setDescription] = useState('');
  const [staged, setStaged] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const selectedClient = webClients.find(c => String(c.id) === String(selectedClientId));

  const handleContinue = () => {
    if (!selectedClientId) {
      setMessage({ type: 'error', text: 'Select a website first' });
      return;
    }
    setMessage(null);
    setStep('details');
  };

  const handleSave = () => {
    if (!workDone.trim()) {
      setMessage({ type: 'error', text: 'Work done is required' });
      return;
    }
    setStaged(current => [...current, {
      key: `${selectedClientId}-${Date.now()}`,
      webClientId: selectedClientId,
      webClientName: selectedClient?.label || '',
      workDone: workDone.trim(),
      description: description.trim(),
    }]);
    setSelectedClientId('');
    setWorkDone('');
    setDescription('');
    setStep('saved');
    setMessage(null);
  };

  const handleAddMore = () => {
    setStep('select');
    setMessage(null);
  };

  const handleRemoveStaged = (key) => {
    setStaged(current => {
      const next = current.filter(e => e.key !== key);
      if (next.length === 0) setStep('select');
      return next;
    });
  };

  const handleSubmit = async () => {
    if (staged.length === 0) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await submitEodReport(staged.map(e => ({
        webClientId: e.webClientId,
        workDone: e.workDone,
        description: e.description,
      })));

      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setStaged([]);
        setStep('select');
        setMessage({
          type: 'success',
          text: `EOD report submitted for ${result.reportDate} — ${result.entriesAdded} ${result.entriesAdded === 1 ? 'entry' : 'entries'} recorded.`,
        });
        router.refresh();
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', margin: 0, marginBottom: '0.5rem' }}>EOD Report</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          Record the work done on each website today. Add an entry per website, then submit —
          everything is filed under <strong>{today}</strong>. Submitting again later today adds
          to the same report.
        </p>
      </div>

      {message && (
        <div style={{
          backgroundColor: message.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
          color: message.type === 'error' ? 'var(--danger)' : 'var(--success)',
          padding: '1rem',
          borderRadius: '0.5rem',
          border: `1px solid ${message.type === 'error' ? 'var(--danger)' : 'var(--success)'}`,
          fontSize: '0.875rem',
        }}>
          {message.text}
        </div>
      )}

      {!hasCampaign ? (
        <div className="card">
          <p style={{ color: 'var(--danger)', margin: 0 }}>No active campaign. Please contact your admin.</p>
        </div>
      ) : webClients.length === 0 ? (
        <div className="card">
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>No active web clients on the current campaign yet.</p>
        </div>
      ) : (
        <div className="card">
          {step === 'select' && (
            <>
              <h2 style={{ fontSize: '1.1rem', margin: 0, marginBottom: '1.25rem' }}>
                {staged.length > 0 ? 'Add another website' : 'Select a website'}
              </h2>
              <div style={{ maxWidth: '420px', marginBottom: '1.25rem' }}>
                <label style={labelStyle}>Website</label>
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">Select a website...</option>
                  {webClients.map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={handleContinue} style={primaryButtonStyle}>
                Continue
              </button>
            </>
          )}

          {step === 'details' && (
            <>
              <h2 style={{ fontSize: '1.1rem', margin: 0, marginBottom: '0.35rem' }}>
                {selectedClient?.label}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0, marginBottom: '1.25rem' }}>
                What was done for this website today?
              </p>

              <div style={{ maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={labelStyle}>Work Done</label>
                  <input
                    type="text"
                    value={workDone}
                    onChange={(e) => setWorkDone(e.target.value)}
                    placeholder="e.g. Published 2 guest posts"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Any extra detail worth recording"
                    style={{ ...inputStyle, minHeight: '110px', resize: 'vertical' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button type="button" onClick={handleSave} style={primaryButtonStyle}>Save</button>
                <button type="button" onClick={() => { setStep('select'); setMessage(null); }} style={secondaryButtonStyle}>
                  Back
                </button>
              </div>
            </>
          )}

          {step === 'saved' && (
            <>
              <h2 style={{ fontSize: '1.1rem', margin: 0, marginBottom: '0.35rem' }}>Entry saved</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0, marginBottom: '1.25rem' }}>
                Add another website, or submit the report as it stands.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button type="button" onClick={handleAddMore} style={secondaryButtonStyle}>+ Add More</button>
                <button type="button" onClick={handleSubmit} disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}>
                  {submitting ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {staged.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Not yet submitted</h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {staged.length} {staged.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {staged.map(entry => (
              <div key={entry.key} style={{ padding: '0.85rem 1rem', border: '1px solid var(--border)', borderRadius: '0.5rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{entry.webClientName}</div>
                  <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>{entry.workDone}</div>
                  {entry.description && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{entry.description}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveStaged(entry.key)}
                  style={{ padding: '0.25rem 0.6rem', backgroundColor: 'transparent', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.7rem', fontWeight: '600', whiteSpace: 'nowrap' }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <button type="button" onClick={handleSubmit} disabled={submitting} style={{ ...primaryButtonStyle, opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}>
            {submitting ? 'Submitting...' : `Submit Report (${staged.length})`}
          </button>
        </div>
      )}

      <div className="card">
        <h2 style={{ fontSize: '1.1rem', margin: 0, marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          My Submitted Reports
        </h2>

        {history.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>No reports submitted yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {history.map(report => (
              <div key={report.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', color: BRAND_COLOR }}>
                    {report.report_date}{report.report_date === today ? ' (today)' : ''}
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {report.entries.length} {report.entries.length === 1 ? 'entry' : 'entries'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {report.entries.map(entry => (
                    <div key={entry.id} style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '0.5rem' }}>
                      <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{entry.web_client_name}</div>
                      <div style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>{entry.work_done}</div>
                      {entry.description && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{entry.description}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
