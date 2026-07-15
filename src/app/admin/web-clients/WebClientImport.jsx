'use client';

import { useState } from 'react';
import Link from 'next/link';
import { importWebClientsFromGoogleSheet } from './actions';
import { useRouter } from 'next/navigation';

export default function WebClientImport() {
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState(null);
  const [importError, setImportError] = useState(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');
  const router = useRouter();

  const handleImport = async (e) => {
    e.preventDefault();

    if (!sheetUrl) {
      setImportError('Please provide a Google Sheet URL');
      return;
    }

    setIsImporting(true);
    setImportMessage(null);
    setImportError(null);
    setNeedsAuth(false);

    try {
      const formData = new FormData();
      formData.append('sheet_url', sheetUrl);

      const result = await importWebClientsFromGoogleSheet(formData);

      if (result.error) {
        // Check if it's an auth error
        if (result.error.includes('No OAuth tokens') || result.error.includes('not authorized')) {
          setImportError('Not connected to Google. Connect your Google account in Settings first.');
          setNeedsAuth(true);
          return;
        }
        setImportError(result.error);
      } else {
        setImportMessage(result.message || 'Web clients imported successfully!');
        setSheetUrl('');
        // Refresh page after 2 seconds
        setTimeout(() => {
          router.refresh();
        }, 2000);
      }
    } catch (error) {
      setImportError(error.message);
    } finally {
      setIsImporting(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    borderRadius: '0.5rem',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
    boxSizing: 'border-box'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Import Web Clients</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>
          Paste your Google Sheet URL to import web clients with their assigned Web SEO Associates.
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0.5rem 0 0 0' }}>
          The sheet should have a tab named <strong>"Active Clients"</strong> with two client-associate pairs:
        </p>
        <ul style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0.5rem 0 1rem 1.5rem', paddingLeft: '0' }}>
          <li><strong>Pair 1:</strong> Column D (Client Names) + Column F (Web SEO Associates)</li>
          <li><strong>Pair 2:</strong> Column L (Client Names) + Column N (Web SEO Associates)</li>
        </ul>
      </div>

      {importError && (
        <div style={{
          padding: '0.75rem',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          color: 'var(--danger)',
          borderRadius: '0.25rem',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          fontSize: '0.875rem'
        }}>
          ⚠️ {importError}
          {needsAuth && (
            <>
              {' '}
              <Link href="/admin/settings" style={{ color: 'var(--danger)', textDecoration: 'underline' }}>
                Go to Settings
              </Link>
            </>
          )}
        </div>
      )}

      {importMessage && (
        <div style={{
          padding: '0.75rem',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          color: 'var(--success)',
          borderRadius: '0.25rem',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          fontSize: '0.875rem'
        }}>
          ✓ {importMessage}
        </div>
      )}

      <form onSubmit={handleImport} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Google Sheet URL
          </label>
          <input
            type="url"
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            style={inputStyle}
            required
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.5rem 0 0 0' }}>
            Make sure the sheet is shared with the Google account connected in Settings
          </p>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={isImporting}
          style={{
            padding: '0.75rem 1.5rem',
            cursor: isImporting ? 'not-allowed' : 'pointer',
            opacity: isImporting ? 0.6 : 1
          }}
        >
          {isImporting ? 'Importing...' : 'Import Web Clients'}
        </button>
      </form>
    </div>
  );
}
