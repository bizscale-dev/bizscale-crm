'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { disconnectGoogleAccount } from './actions';

export default function GoogleAuthConnection({ isConnected, connectedAt }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [actionMessage, setActionMessage] = useState(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const urlError = searchParams.get('error');
  const urlSuccess = searchParams.get('success');
  const message = actionMessage
    || (urlError ? { type: 'error', text: `Authorization failed: ${urlError}` } : null)
    || (urlSuccess ? { type: 'success', text: '✓ Successfully connected to Google!' } : null);

  // Side effect only — clears the ?error=/?success= query params from the URL bar.
  // Deliberately not driving component state here to avoid a setState-in-effect
  // cascade; the banner above is derived straight from searchParams on render.
  useEffect(() => {
    if (urlError || urlSuccess) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAuthorize = () => {
    window.location.href = '/api/auth/google/authorize?returnTo=/admin/settings';
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect the Google account? Any features that import from private Google Sheets (clients, associates, web clients) will stop working until you reconnect.')) {
      return;
    }

    setDisconnecting(true);
    try {
      const result = await disconnectGoogleAccount();
      if (result.error) {
        setActionMessage({ type: 'error', text: result.error });
      } else {
        setActionMessage({ type: 'success', text: result.success });
        router.refresh();
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
        This single connection is shared across the whole app — importing clients, associates, and web clients
        from private Google Sheets all use this one Google account. Connect it once here.
      </p>

      {message && (
        <div
          style={{
            color: message.type === 'error' ? 'var(--danger)' : 'var(--success)',
            marginBottom: '1rem',
            padding: '0.75rem',
            border: `1px solid ${message.type === 'error' ? 'var(--danger)' : 'var(--success)'}`,
            borderRadius: '0.5rem',
            backgroundColor: message.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
            fontSize: '0.875rem',
          }}
        >
          {message.text}
        </div>
      )}

      {isConnected ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.35rem 0.7rem',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              color: 'var(--success)',
              borderRadius: '0.35rem',
              fontSize: '0.8rem',
              fontWeight: '600'
            }}>
              ✓ Connected
            </span>
            {connectedAt && (
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Connected since {new Date(connectedAt).toLocaleString()}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={handleAuthorize} className="btn" style={{ backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--foreground)' }}>
              Reconnect
            </button>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="btn"
              style={{ backgroundColor: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', opacity: disconnecting ? 0.6 : 1 }}
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={handleAuthorize} className="btn btn-primary" style={{ padding: '0.75rem 1.5rem' }}>
          🔒 Connect Google Account
        </button>
      )}
    </div>
  );
}
