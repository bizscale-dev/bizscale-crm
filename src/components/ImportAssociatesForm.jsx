'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const inputStyle = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)',
};

export default function ImportAssociatesForm({ importAction }) {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [formData, setFormData] = useState({
    sheet_url: '',
    associate_column: 'H',
    client_column: 'C',
    skip_header: true,
  });

  useEffect(() => {
    // Check if user is authorized
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
      const response = await fetch('/api/google-sheets/import-associates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetUrl: formData.sheet_url,
          associateColumn: formData.associate_column,
          clientColumn: formData.client_column,
          skipHeader: formData.skip_header,
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

    setIsImporting(true);
    setImportResult(null);

    const formDataToSubmit = new FormData();
    formDataToSubmit.append('associates_json', JSON.stringify(previewData.associates));

    try {
      const result = await importAction(null, formDataToSubmit);
      
      if (result.success) {
        setImportResult({ success: result.success });
        // Refresh page to show new associates
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else if (result.error) {
        setImportResult({ error: result.error });
      }
    } catch (error) {
      setImportResult({ error: 'Error importing: ' + error.message });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div>
      {importResult?.error && (
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
          {importResult.error}
        </div>
      )}
      {importResult?.success && (
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
          {importResult.success}
        </div>
      )}

      {!isAuthorized ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Not connected to Google. Connect your Google account in Settings to import from sheets.
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
                value={formData.sheet_url}
                onChange={(e) => setFormData({ ...formData, sheet_url: e.target.value })}
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
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Associate name column</label>
                <input
                  type="text"
                  placeholder="H"
                  required
                  pattern="[A-Za-z]+"
                  title="Column letter, e.g. H"
                  style={inputStyle}
                  value={formData.associate_column}
                  onChange={(e) =>
                    setFormData({ ...formData, associate_column: e.target.value })
                  }
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Client column</label>
                <input
                  type="text"
                  placeholder="C"
                  required
                  pattern="[A-Za-z]+"
                  title="Column letter, e.g. C"
                  style={inputStyle}
                  value={formData.client_column}
                  onChange={(e) =>
                    setFormData({ ...formData, client_column: e.target.value })
                  }
                />
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={formData.skip_header}
                  onChange={(e) =>
                    setFormData({ ...formData, skip_header: e.target.checked })
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
              disabled={isPreviewLoading || !formData.sheet_url}
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
              <h3 style={{ marginBottom: '1rem' }}>
                Preview ({previewData.count} associates found)
              </h3>
              <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--card-bg)' }}>
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>Associate Name</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>Assigned Clients</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.associates.slice(0, 10).map((associate, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.5rem', fontWeight: '500' }}>{associate.name}</td>
                        <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>
                          {associate.clients.length} client{associate.clients.length !== 1 ? 's' : ''}
                          <br />
                          <span style={{ fontSize: '0.75rem' }}>
                            {associate.clients.slice(0, 3).join(', ')}
                            {associate.clients.length > 3 ? ', ...' : ''}
                          </span>
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
                <button type="submit" className="btn btn-primary" disabled={isImporting}>
                  {isImporting ? 'Importing...' : `Import ${previewData.count} Associates`}
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}
