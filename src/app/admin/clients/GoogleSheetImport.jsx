'use client';

import { useState } from 'react';
import GoogleSheetImportForm from '@/components/GoogleSheetImportForm';
import { importClientsFromGoogleSheet } from './actions';
import { triggerManualSync } from './actions';
import { useRouter } from 'next/navigation';

export default function GoogleSheetImport() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const router = useRouter();

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    setSyncError(null);

    try {
      const result = await triggerManualSync();
      if (result.error) {
        setSyncError(result.error);
      } else {
        setSyncMessage(result.message);
        // Refresh page after 2 seconds
        setTimeout(() => {
          router.refresh();
        }, 2000);
      }
    } catch (error) {
      setSyncError(error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <GoogleSheetImportForm importAction={importClientsFromGoogleSheet} />

      <div style={{
        padding: '1rem',
        border: '1px solid var(--border)',
        borderRadius: '0.5rem',
        backgroundColor: 'var(--background)'
      }}>
        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Manual Sync</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0 0 1rem 0' }}>
          Click below to manually sync clients from Google Sheets for this campaign. This will:
        </p>
        <ul style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0 0 1rem 0', paddingLeft: '1.5rem' }}>
          <li>Fetch all clients from the Google Sheet</li>
          <li>Add new clients automatically</li>
          <li>Create associates (Column H) if they don&apos;t exist</li>
          <li>Create writers (Column I) if they don&apos;t exist</li>
          <li>Assign clients to associates and writers</li>
          <li>Generate SEO and writing tasks automatically</li>
        </ul>

        {syncError && (
          <div style={{
            padding: '0.75rem',
            marginBottom: '1rem',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: 'var(--danger)',
            borderRadius: '0.25rem',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            fontSize: '0.875rem'
          }}>
            {syncError}
          </div>
        )}

        {syncMessage && (
          <div style={{
            padding: '0.75rem',
            marginBottom: '1rem',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            color: 'var(--success)',
            borderRadius: '0.25rem',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            fontSize: '0.875rem'
          }}>
            ✓ {syncMessage}
          </div>
        )}

        <button
          onClick={handleManualSync}
          disabled={isSyncing}
          className="btn btn-primary"
          style={{
            backgroundColor: isSyncing ? 'var(--text-muted)' : undefined,
            cursor: isSyncing ? 'not-allowed' : 'pointer'
          }}
        >
          {isSyncing ? 'Syncing...' : 'Sync Now from Google Sheets'}
        </button>
      </div>
    </div>
  );
}
