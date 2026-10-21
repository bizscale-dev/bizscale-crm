'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { confirmReportFix, rejectReportFix } from './actions';

// QA's verdict on a manager's fix: confirm it (-> Resolved) or reject it
// (-> open again, manager notified, reason required).
export default function ReviewControls({ reportId }) {
  const router = useRouter();
  const [mode, setMode] = useState(null); // null | 'confirm' | 'reject'
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = mode === 'confirm' ? await confirmReportFix(reportId, text) : await rejectReportFix(reportId, text);
    setBusy(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setMode(null);
    setText('');
    router.refresh();
  };

  const btn = (bg, color, border) => ({ padding: '0.5rem 1.2rem', backgroundColor: bg, color, border: `1px solid ${border}`, borderRadius: '0.5rem', fontWeight: '600', fontSize: '0.82rem', cursor: 'pointer' });

  return (
    <div style={{ marginTop: '0.9rem', padding: '0.85rem 1rem', border: '1px solid rgba(59, 130, 246, 0.4)', backgroundColor: 'rgba(59, 130, 246, 0.05)', borderRadius: '0.5rem' }}>
      <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#3b82f6', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
        Awaiting your QA check
      </div>
      {!mode ? (
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setMode('confirm')} style={btn('var(--success)', 'white', 'var(--success)')}>Passed QA — resolve</button>
          <button type="button" onClick={() => setMode('reject')} style={btn('transparent', 'var(--danger)', 'var(--danger)')}>Failed QA — reject</button>
        </div>
      ) : (
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
            {mode === 'confirm' ? 'Comment (optional)' : 'Why did it fail QA? (the manager will see this)'}
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={2000}
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)', fontSize: '0.85rem', fontFamily: 'inherit', resize: 'vertical' }}
          />
          {error && <div style={{ fontSize: '0.78rem', color: 'var(--danger)', marginTop: '0.3rem' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" onClick={submit} disabled={busy} style={{ ...(mode === 'confirm' ? btn('var(--success)', 'white', 'var(--success)') : btn('var(--danger)', 'white', 'var(--danger)')), opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Saving…' : mode === 'confirm' ? 'Confirm resolved' : 'Reject and notify manager'}
            </button>
            <button type="button" onClick={() => { setMode(null); setError(null); }} style={btn('transparent', 'var(--foreground)', 'var(--border)')}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
