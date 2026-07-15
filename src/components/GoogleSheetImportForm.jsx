'use client';

import { useState, useEffect } from 'react';
import { useActionState } from 'react';
import Link from 'next/link';

const inputStyle = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)',
};

export default function GoogleSheetImportForm({ importAction }) {
  const [state, formAction, isPending] = useActionState(importAction, {
    error: null,
    success: null,
  });

  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [sheetFormData, setSheetFormData] = useState({
    sheet_url: '',
    name_column: 'A',
    website_column: '',
    skip_header: true,
  });

  useEffect(() => {
    // Check if user is authorized by trying a simple API call
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/google-sheets/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sheetUrl: '', nameColumn: '' }),
        });
        setIsAuthorized(response.status !== 401);
      } catch (err) {
        setIsAuthorized(false);
      }
    };
    checkAuth();
  }, []);

  const handlePreview = async () => {
    setIsPreviewLoading(true);
    setPreviewError(null);
    setPreviewData(null);

    try {
      const response = await fetch('/api/google-sheets/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetUrl: sheetFormData.sheet_url,
          nameColumn: sheetFormData.name_column,
          websiteColumn: sheetFormData.website_column,
          skipHeader: sheetFormData.skip_header,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.error === 'not_authorized') {
          setPreviewError('Not connected to Google. Connect your Google account in Settings first.');
          setIsAuthorized(false);
          return;
        }
        setPreviewError(result.message || result.error || 'Failed to fetch sheet');
        return;
      }

      setPreviewData(result);
    } catch (err) {
      setPreviewError(err.message || 'Failed to fetch sheet');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleImport = async (e) => {
    e.preventDefault();
    
    if (!previewData) {
      setPreviewError('Please preview the sheet first');
      return;
    }

    const formData = new FormData();
    formData.append('clients_json', JSON.stringify(previewData.clients));
    
    await formAction(formData);
  };

  return (
    <div>
      {state?.error && (
        <div
          style={{
            color: 'var(--danger)',
            marginBottom: '1rem',
            padding: '0.75rem',
            border: '1px solid var(--danger)',
            borderRadius: '0.5rem',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
          }}
        >
          {state.error}
        </div>
      )}
      {state?.success && (
        <div
          style={{
            color: 'var(--success)',
            marginBottom: '1rem',
            padding: '0.75rem',
            border: '1px solid var(--success)',
            borderRadius: '0.5rem',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
          }}
        >
          {state.success}
        </div>
      )}

      {!isAuthorized ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Not connected to Google. Connect your Google account in Settings to import sheets securely.
          </p>
          <Link href="/admin/settings" className="btn btn-primary" style={{ padding: '0.75rem 1.5rem', display: 'inline-block' }}>
            Go to Settings
          </Link>
        </div>
      ) : (
        <>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
            ✓ Authorized with Google. Paste your sheet link and select your columns.
          </p>

          <form>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Google Sheet URL</label>
              <input
                type="url"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                required
                style={inputStyle}
                value={sheetFormData.sheet_url}
                onChange={(e) =>
                  setSheetFormData({ ...sheetFormData, sheet_url: e.target.value })
                }
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1.5rem',
                marginBottom: '1rem',
              }}
            >
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Client name column</label>
                <input
                  type="text"
                  placeholder="A"
                  required
                  pattern="[A-Za-z]+"
                  title="Column letter, e.g. A or B"
                  style={inputStyle}
                  value={sheetFormData.name_column}
                  onChange={(e) =>
                    setSheetFormData({ ...sheetFormData, name_column: e.target.value })
                  }
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                  Website column (optional)
                </label>
                <input
                  type="text"
                  placeholder="B"
                  pattern="[A-Za-z]*"
                  title="Column letter, e.g. B"
                  style={inputStyle}
                  value={sheetFormData.website_column}
                  onChange={(e) =>
                    setSheetFormData({ ...sheetFormData, website_column: e.target.value })
                  }
                />
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={sheetFormData.skip_header}
                  onChange={(e) =>
                    setSheetFormData({ ...sheetFormData, skip_header: e.target.checked })
                  }
                />
                First row is a header (skip it)
              </label>
            </div>

            <button
              type="button"
              className="btn"
              style={{ marginRight: '1rem' }}
              onClick={handlePreview}
              disabled={isPreviewLoading || !sheetFormData.sheet_url}
            >
              {isPreviewLoading ? 'Fetching...' : 'Preview Data'}
            </button>
          </form>

          {previewError && (
            <div
              style={{
                color: 'var(--danger)',
                marginTop: '1rem',
                padding: '0.75rem',
                border: '1px solid var(--danger)',
                borderRadius: '0.5rem',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
              }}
            >
              {previewError}
            </div>
          )}

          {previewData && (
            <div style={{ marginTop: '1.5rem' }}>
              <h3 style={{ marginBottom: '1rem' }}>Preview ({previewData.count} clients found)</h3>
              <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--card-bg)' }}>
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>Client Name</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>Website</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.clients.slice(0, 10).map((client, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.5rem' }}>{client.name}</td>
                        <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>
                          {client.website || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewData.count > 10 && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                  ... and {previewData.count - 10} more
                </p>
              )}

              <form onSubmit={handleImport}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isPending}
                >
                  {isPending ? 'Importing...' : `Import ${previewData.count} Clients`}
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}
