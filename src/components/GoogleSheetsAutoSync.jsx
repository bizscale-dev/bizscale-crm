'use client';

import { useState, useEffect } from 'react';

const buttonStyle = {
  padding: '0.75rem 1.5rem',
  borderRadius: '0.5rem',
  border: 'none',
  cursor: 'pointer',
  fontSize: '0.9rem',
  fontWeight: '500',
  transition: 'all 0.2s ease',
};

const primaryBtn = {
  ...buttonStyle,
  backgroundColor: 'var(--primary)',
  color: 'white',
};

const dangerBtn = {
  ...buttonStyle,
  backgroundColor: 'var(--danger)',
  color: 'white',
};

const warningBtn = {
  ...buttonStyle,
  backgroundColor: '#f59e0b',
  color: 'white',
};

const cardStyle = {
  padding: '1.5rem',
  border: '1px solid var(--border)',
  borderRadius: '0.5rem',
  backgroundColor: 'var(--card-bg)',
  marginBottom: '1.5rem',
};

export default function GoogleSheetsAutoSync() {
  const [cycleInfo, setCycleInfo] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');
  const [message, setMessage] = useState(null);

  // Fetch cycle info on mount
  useEffect(() => {
    fetchCycleInfo();
    const interval = setInterval(fetchCycleInfo, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const fetchCycleInfo = async () => {
    try {
      const res = await fetch('/api/campaign/check-cycle');
      if (res.ok) {
        const data = await res.json();
        setCycleInfo(data.cycle);
      }
    } catch (error) {
      console.error('Failed to fetch cycle info:', error);
    }
  };

  const handleSync = async () => {
    if (!sheetUrl.trim()) {
      setMessage({ type: 'error', text: 'Please enter a Google Sheets URL' });
      return;
    }

    setIsSyncing(true);
    setMessage(null);

    try {
      // Step 1: Sync clients (pass sheetUrl only, endpoint will use active campaign)
      const syncRes = await fetch('/api/google-sheets/sync-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetUrl }),
      });

      if (!syncRes.ok) {
        throw new Error('Failed to sync clients');
      }

      const syncData = await syncRes.json();
      setSyncStatus(syncData);

      console.log('[GoogleSheetsAutoSync] Sync completed:', {
        campaign: syncData.campaign?.name,
        totalClients: syncData.totalClientsInSheet,
        writerAssignmentsCount: syncData.writerAssignments ? Object.keys(syncData.writerAssignments).length : 0,
        associateAssignmentsCount: syncData.associateAssignments ? Object.keys(syncData.associateAssignments).length : 0,
      });

      // Step 1.5: Import writers from sheet (ensure they exist before assigning)
      if (syncData.writerAssignments && Object.keys(syncData.writerAssignments).length > 0) {
        const writerNames = Object.keys(syncData.writerAssignments);
        console.log(`[sync] Importing ${writerNames.length} writers from sheet...`);
        
        const importRes = await fetch('/api/google-sheets/import-writers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ writerNames }),
        });

        if (importRes.ok) {
          const importData = await importRes.json();
          console.log(`[sync] Writers imported: ${importData.created} created, ${importData.existing} existing`);
        } else {
          console.warn('[sync] Writer import failed, continuing anyway...');
        }
      }

      // Step 2: Apply changes (including associate and writer assignments)
      // IMPORTANT: Call even if no changes, because writerAssignments might need to be applied
      if (syncData.changes || syncData.writerAssignments || syncData.associateAssignments) {
        console.log('[GoogleSheetsAutoSync] Applying changes/assignments...');
        const applyRes = await fetch('/api/google-sheets/sync-apply-changes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            changes: syncData.changes,
            campaignId: syncData.campaign?.id, // Pass campaign ID explicitly
            associateAssignments: syncData.associateAssignments,
            writerAssignments: syncData.writerAssignments,
          }),
        });

        if (applyRes.ok) {
          const applyData = await applyRes.json();
          console.log('[GoogleSheetsAutoSync] Apply result:', applyData.results);
          setMessage({
            type: 'success',
            text: `Sync complete! ${applyData.results.writersAssigned} writers assigned, ${applyData.results.associatesAssigned} associates assigned${applyData.results.writerTasksGenerated ? ' ✅ Tasks generated!' : ''}`,
          });
        } else {
          const errorData = await applyRes.json();
          throw new Error(errorData.message || 'Failed to apply changes');
        }
      }

      // Step 3: Assign new clients
      if (syncData.changes?.added?.length > 0) {
        const assignRes = await fetch('/api/google-sheets/sync-assign-new-clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newClients: syncData.changes.added }),
        });

        if (assignRes.ok) {
          const assignData = await assignRes.json();
          setMessage({
            type: 'success',
            text: `${syncData.changes.added.length} new clients added, ${assignData.results.tasksCreated} tasks created`,
          });
        }
      }
    } catch (error) {
      console.error('[GoogleSheetsAutoSync] Error:', error);
      setMessage({ type: 'error', text: error.message });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleResetCycle = async () => {
    if (!window.confirm('This will create a new 16-day cycle. Continue?')) {
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/campaign/reset-cycle', {
        method: 'POST',
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({
          type: 'success',
          text: `Cycle reset! Starting cycle ${data.cycleNumber}`,
        });
        fetchCycleInfo();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to reset cycle' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      {/* Cycle Status */}
      {cycleInfo && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>📅 Current Campaign Cycle</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0 0 0.5rem' }}>Cycle</p>
              <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>#{cycleInfo.cycleNumber}</p>
            </div>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0 0 0.5rem' }}>Day in Cycle</p>
              <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>{cycleInfo.daysIntoCycle + 1}/16</p>
            </div>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0 0 0.5rem' }}>Days Remaining</p>
              <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold', color: cycleInfo.daysRemaining <= 2 ? 'var(--danger)' : 'var(--success)' }}>
                {cycleInfo.daysRemaining}
              </p>
            </div>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0 0 0.5rem' }}>Cycle Ends</p>
              <p style={{ margin: 0, fontSize: '0.95rem' }}>{cycleInfo.cycleEndDate}</p>
            </div>
          </div>

          {cycleInfo.daysRemaining === 0 && (
            <button
              onClick={handleResetCycle}
              disabled={isLoading}
              style={warningBtn}
            >
              {isLoading ? 'Resetting...' : '🔄 Reset to New Cycle'}
            </button>
          )}
        </div>
      )}

      {/* Manual Sync */}
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>🔄 Manual Sync from Google Sheets</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Manually sync clients from your Google Sheet. This runs automatically once daily at 11:52 PM (Pakistan Time).
        </p>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Google Sheet URL
          </label>
          <input
            type="url"
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid var(--border)',
              borderRadius: '0.5rem',
              backgroundColor: 'var(--background)',
              color: 'var(--foreground)',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
            }}
          />
        </div>

        <button
          onClick={handleSync}
          disabled={isSyncing || !sheetUrl.trim()}
          style={primaryBtn}
        >
          {isSyncing ? '⏳ Syncing...' : '🔄 Sync Now'}
        </button>

        {syncStatus && (
          <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'rgba(99, 102, 241, 0.05)', borderRadius: '0.5rem', border: '1px solid var(--primary)' }}>
            <p style={{ margin: '0 0 0.5rem', fontWeight: '600' }}>Sync Results:</p>
            <ul style={{ margin: 0, paddingLeft: '1.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              <li>📊 Total in sheet: {syncStatus.totalClientsInSheet}</li>
              <li>💾 Active in DB: {syncStatus.totalClientsInDB}</li>
              <li>✨ New clients: {syncStatus.changes?.added?.length || 0}</li>
              <li>🔄 Reactivated: {syncStatus.changes?.reactivated?.length || 0}</li>
              <li>❌ Deactivated: {syncStatus.changes?.deactivated?.length || 0}</li>
            </ul>
          </div>
        )}
      </div>

      {/* Messages */}
      {message && (
        <div
          style={{
            padding: '1rem',
            borderRadius: '0.5rem',
            border: `1px solid ${message.type === 'error' ? 'var(--danger)' : 'var(--success)'}`,
            backgroundColor: message.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
            color: message.type === 'error' ? 'var(--danger)' : 'var(--success)',
            marginTop: '1rem',
          }}
        >
          {message.type === 'error' ? '❌' : '✅'} {message.text}
        </div>
      )}

      {/* Info */}
      <div style={{ ...cardStyle, backgroundColor: 'rgba(99, 102, 241, 0.05)', border: '1px solid var(--primary)' }}>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          ℹ️ <strong>Auto-sync runs once daily at 11:52 PM (Pakistan Time).</strong> New clients added to your sheet are automatically assigned to associates and tasks are created from today to end of cycle. Deactivated clients lose only future tasks.
        </p>
      </div>
    </div>
  );
}
