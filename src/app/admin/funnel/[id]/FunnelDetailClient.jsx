'use client';

import { useState } from 'react';
import { forceAdvanceFunnelClientAction, moveFunnelClientToNormalAction } from '../actions';

const BRAND_COLOR = '#16b293';

export default function FunnelDetailClient({ client }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  if (client.tunnel_status !== 'active') {
    return (
      <div className="card">
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>
          This client has graduated from the funnel and is working the main campaign.
        </p>
      </div>
    );
  }

  const isLastMonth = client.funnel_month === 3;

  const runAction = async (action, confirmMessage) => {
    if (!confirm(confirmMessage)) return;

    setLoading(true);
    try {
      const result = await action(client.id);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: result.success });
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleAdvance = () => runAction(
    forceAdvanceFunnelClientAction,
    isLastMonth ? 'Graduate this client to the main campaign now?' : `Force-advance this client to Month ${client.funnel_month + 1} now?`
  );

  const handleMoveToNormal = () => runAction(
    moveFunnelClientToNormalAction,
    'Move this client straight to the normal client list now? This skips any remaining funnel months.'
  );

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Manual Override</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Progression normally happens automatically via the daily sync. Use these only if you need to push this
        client along sooner.
      </p>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <button
          onClick={handleAdvance}
          disabled={loading}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: BRAND_COLOR,
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: '600',
            fontSize: '0.875rem',
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading ? 'Working...' : isLastMonth ? '✓ Graduate to Main Campaign' : `Force-Advance to Month ${client.funnel_month + 1}`}
        </button>

        <button
          onClick={handleMoveToNormal}
          disabled={loading}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: 'transparent',
            color: 'var(--success)',
            border: '1px solid var(--success)',
            borderRadius: '0.5rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: '600',
            fontSize: '0.875rem',
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading ? 'Working...' : 'Move to Normal Clients Now'}
        </button>
      </div>

      {message && (
        <p style={{ marginTop: '1rem', color: message.type === 'error' ? 'var(--danger)' : 'var(--success)', fontSize: '0.875rem' }}>
          {message.text}
        </p>
      )}
    </div>
  );
}
