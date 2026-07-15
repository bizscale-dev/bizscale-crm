'use client';

import { useState, useEffect } from 'react';
import { updateWebSeoCompletedLinksSheetUrl } from '../settings/actions';

export default function SyncWebSeoLinksClient() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [sheetUrl, setSheetUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [savedUrl, setSavedUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchSavedUrl = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/debug/check-settings');
      const data = await res.json();

      if (data.webSeoCompletedLinksSheetUrl && data.webSeoCompletedLinksSheetUrl !== 'NOT SET') {
        setSavedUrl(data.webSeoCompletedLinksSheetUrl);
      } else {
        setSavedUrl('');
      }
    } catch (err) {
      console.error('Error fetching saved URL:', err);
      setSavedUrl('');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSavedUrl();
  }, []);

  const handleSaveUrl = async () => {
    if (!sheetUrl.trim()) {
      setMessage({ type: 'error', text: 'Enter a Google Sheet URL first' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.set('sheet_url', sheetUrl.trim());
      const result = await updateWebSeoCompletedLinksSheetUrl(null, formData);

      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: result.success });
        setSavedUrl(sheetUrl.trim());
        setSheetUrl('');
        setShowUrlInput(false);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setLoading(true);
    setMessage(null);
    setSyncResult(null);

    try {
      const urlToUse = sheetUrl || savedUrl || undefined;

      const res = await fetch('/api/sync-webseo-completed-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetUrl: urlToUse })
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || 'Sync failed' });
      } else {
        setMessage({ type: 'success', text: data.message });
        setLastSync(new Date().toLocaleString());
        setSyncResult(data);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', margin: 0, marginBottom: '1rem' }}>
          Web SEO Associate — Configure &amp; Sync
        </h2>
        <p style={{ color: 'var(--text-muted)', margin: 0, marginBottom: '1rem', fontSize: '0.875rem' }}>
          Tracks Web 2.0 and Guest Post task completion for Web SEO Associates from a separate Google Sheet (Client Name, Sheet URL, Total, Web 2.0, Guest Post, Last Update).
        </p>

        {/* URL Configuration Section */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--background)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <label style={{ fontWeight: '600', fontSize: '0.95rem' }}>Google Sheet URL for Web SEO Sync</label>
            <button
              type="button"
              onClick={() => setShowUrlInput(!showUrlInput)}
              style={{
                backgroundColor: 'transparent',
                border: `1px solid var(--border)`,
                color: 'var(--primary)',
                padding: '0.35rem 0.75rem',
                borderRadius: '0.35rem',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: '600'
              }}
            >
              {showUrlInput ? 'Hide' : 'Edit'}
            </button>
          </div>

          {showUrlInput ? (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <input
                type="url"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                style={{
                  flex: 1,
                  minWidth: '240px',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--card-bg)',
                  color: 'var(--foreground)',
                  fontSize: '0.875rem'
                }}
              />
              <button
                type="button"
                onClick={handleSaveUrl}
                disabled={saving}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  backgroundColor: 'var(--success)',
                  color: 'white',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  fontSize: '0.875rem',
                  opacity: saving ? 0.6 : 1
                }}
              >
                {saving ? 'Saving...' : 'Save as Default'}
              </button>
              <button
                type="button"
                onClick={() => setShowUrlInput(false)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border)',
                  backgroundColor: 'transparent',
                  color: 'var(--foreground)',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.875rem'
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div style={{
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--card-bg)',
              borderRadius: '0.35rem',
              fontSize: '0.85rem',
              color: 'var(--text-muted)',
              fontFamily: 'monospace',
              overflow: 'auto',
              maxHeight: '60px',
              wordBreak: 'break-all',
              minHeight: '40px',
              display: 'flex',
              alignItems: 'center'
            }}>
              {sheetUrl ? (
                <span style={{ color: 'var(--success)', fontWeight: '600' }}>📌 Custom Override: {sheetUrl}</span>
              ) : savedUrl ? (
                <span style={{ color: 'var(--primary)' }}>✓ Using Saved URL: {savedUrl}</span>
              ) : (
                <span style={{ color: 'var(--danger)' }}>⚠️ No URL configured. Click &quot;Edit&quot; above to set one.</span>
              )}
            </div>
          )}

          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            &quot;Save as Default&quot; persists this URL for the daily 11:30 PM (PKT) sync and future visits to this page.
          </p>
        </div>

        {/* Sync Buttons */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button
            onClick={handleSync}
            disabled={loading}
            className="btn"
            style={{
              backgroundColor: 'var(--success)',
              color: 'white',
              border: 'none'
            }}
          >
            {loading ? 'Syncing...' : '🔄 Fetch & Update Now'}
          </button>

          <button
            onClick={fetchSavedUrl}
            disabled={loading}
            className="btn"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--primary)',
              border: '1px solid var(--primary)'
            }}
          >
            🔄 Refresh Settings
          </button>
        </div>

        {lastSync && (
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Last sync: {lastSync}
          </div>
        )}
      </div>

      {message && (
        <div style={{
          marginBottom: '1rem',
          padding: '0.75rem',
          borderRadius: '0.5rem',
          backgroundColor: message.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
          color: message.type === 'error' ? 'var(--danger)' : 'var(--success)',
          border: `1px solid ${message.type === 'error' ? 'var(--danger)' : 'var(--success)'}`,
          wordBreak: 'break-word'
        }}>
          {message.text}
        </div>
      )}

      {syncResult && (
        <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', margin: 0, marginBottom: '1rem' }}>
            Sync Summary
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ padding: '0.75rem', backgroundColor: 'var(--background)', borderRadius: '0.5rem' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                Records Synced
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                {syncResult.syncedCount}
              </div>
            </div>
            <div style={{ padding: '0.75rem', backgroundColor: 'var(--background)', borderRadius: '0.5rem' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                Clients Updated
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--success)' }}>
                {syncResult.syncedClients?.length || 0}
              </div>
            </div>
          </div>

          {syncResult.syncedClients && syncResult.syncedClients.length > 0 && (
            <div>
              <h4 style={{ fontSize: '0.9rem', margin: 0, marginBottom: '0.75rem', color: 'var(--text-muted)' }}>
                Clients Synced
              </h4>
              <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '0.5rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--background)' }}>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', color: 'var(--text-muted)' }}>Client</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Web 2.0</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Guest Post</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncResult.syncedClients.map((client, i) => (
                      <tr key={i} style={{ borderBottom: i < syncResult.syncedClients.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <td style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '500' }}>{client.name}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--success)', fontWeight: '600' }}>{client.web2}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--success)', fontWeight: '600' }}>{client.guestpost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {syncResult.errors && syncResult.errors.length > 0 && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', borderRadius: '0.5rem' }}>
              <h4 style={{ fontSize: '0.9rem', margin: 0, marginBottom: '0.5rem', color: 'var(--danger)' }}>
                Warnings ({syncResult.errors.length})
              </h4>
              <ul style={{ margin: 0, paddingLeft: '1.5rem', color: 'var(--danger)', fontSize: '0.825rem' }}>
                {syncResult.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
