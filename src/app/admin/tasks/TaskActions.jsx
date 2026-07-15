'use client';

import { useState } from 'react';
import { generateSEO, generateWriting, generateWebSeo, generateAll, clearSEO, clearWriting, clearWebSeo } from './actions';

export default function TaskActions() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleAction = async (actionFn, confirmMsg) => {
    if (confirmMsg && !confirm(confirmMsg)) return;

    setLoading(true);
    setMessage(null);
    try {
      const res = await actionFn();
      if (res?.error) setMessage({ type: 'error', text: res.error });
      else if (res?.success) setMessage({ type: 'success', text: res.success });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {message && (
        <div style={{ 
          marginBottom: '1rem', padding: '0.75rem', borderRadius: '0.5rem', 
          backgroundColor: message.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
          color: message.type === 'error' ? 'var(--danger)' : 'var(--success)',
          border: `1px solid ${message.type === 'error' ? 'var(--danger)' : 'var(--success)'}`
        }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <button 
          onClick={() => handleAction(generateAll, 'Generate all tasks? This will overwrite existing tasks.')}
          disabled={loading}
          className="btn btn-primary">
          Generate All Tasks
        </button>
        <button 
          onClick={() => handleAction(generateSEO, 'Generate SEO tasks? This will overwrite existing SEO tasks.')}
          disabled={loading}
          className="btn" style={{ backgroundColor: 'var(--primary)', color: 'white' }}>
          Generate SEO Tasks
        </button>
        <button
          onClick={() => handleAction(generateWriting, 'Generate Writing tasks? This will overwrite existing writing tasks.')}
          disabled={loading}
          className="btn" style={{ backgroundColor: 'var(--success)', color: 'white' }}>
          Generate Writing Tasks
        </button>
        <button
          onClick={() => handleAction(generateWebSeo, 'Generate Web SEO Associate tasks? This will overwrite the existing batch-rotation schedule.')}
          disabled={loading}
          className="btn" style={{ backgroundColor: 'var(--warning)', color: 'white' }}>
          Generate Web SEO Tasks
        </button>

        <div style={{ width: '1px', backgroundColor: 'var(--border)', margin: '0 0.5rem' }}></div>

        <button
          onClick={() => handleAction(clearSEO, 'Clear all SEO tasks for this campaign?')}
          disabled={loading}
          className="btn" style={{ backgroundColor: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          Clear SEO
        </button>
        <button
          onClick={() => handleAction(clearWriting, 'Clear all Writing tasks for this campaign?')}
          disabled={loading}
          className="btn" style={{ backgroundColor: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          Clear Writing
        </button>
        <button
          onClick={() => handleAction(clearWebSeo, 'Clear all Web SEO tasks for this campaign?')}
          disabled={loading}
          className="btn" style={{ backgroundColor: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          Clear Web SEO
        </button>
      </div>
    </div>
  );
}
