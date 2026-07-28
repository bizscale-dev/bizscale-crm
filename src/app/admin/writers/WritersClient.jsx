'use client';

import { useState } from 'react';
import { regenerateWriterTasks, clearWriterTasks } from './actions';
import { updateWriterOffpageSheetUrl } from '../settings/actions';

const BRAND_COLOR = '#16b293';

const inputStyle = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)'
};

export default function WritersClient({ writers, writerStats, writerOffpageSheetUrl = '' }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [sheetUrl, setSheetUrl] = useState(writerOffpageSheetUrl);
  const [isSavingUrl, setIsSavingUrl] = useState(false);

  const handleSaveSheetUrl = async () => {
    if (!sheetUrl) {
      setMessage({ type: 'error', text: 'Enter a Google Sheet URL first' });
      return;
    }
    setIsSavingUrl(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.set('sheet_url', sheetUrl);
      const result = await updateWriterOffpageSheetUrl(null, formData);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: result.success });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setIsSavingUrl(false);
    }
  };

  const handleRegenerateTasks = async () => {
    if (!confirm('Sync GBP-Off Page / Web-Off Page tasks now? This re-reads the sheet and rebuilds task rows.')) return;

    setLoading(true);
    setMessage(null);
    try {
      const result = await regenerateWriterTasks();
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: result.success });
        // Refresh the page
        window.location.reload();
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleClearTasks = async () => {
    if (!confirm('Clear all GBP-Off/Web-Off writer tasks? This cannot be undone.')) return;

    setLoading(true);
    setMessage(null);
    try {
      const result = await clearWriterTasks();
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: result.success });
        // Refresh the page
        window.location.reload();
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const getStatForWriter = (writerId) => {
    return writerStats.find(s => s.id === writerId) || {};
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Message Alert */}
      {message && (
        <div
          style={{
            backgroundColor: message.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
            color: message.type === 'error' ? 'var(--danger)' : 'var(--success)',
            padding: '1rem',
            borderRadius: '0.5rem',
            border: `1px solid ${message.type === 'error' ? 'var(--danger)' : 'var(--success)'}`
          }}
        >
          {message.text}
        </div>
      )}

      {/* GBP-Off Page / Web-Off Page Sheet */}
      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Writer GBP-Off Page / Web-Off Page Sheet</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0 0 1rem 0' }}>
          One spreadsheet containing both tabs (named by current month/year, e.g. &quot;{new Date().toLocaleString('en-US', { month: 'long' })} {new Date().getFullYear()} GBP-Off Page&quot;). Writers mark work Done directly in the sheet — this app only mirrors progress.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '260px' }}>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', fontWeight: '500' }}>Google Sheet URL</label>
            <input
              type="url"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              style={inputStyle}
            />
          </div>
          <button onClick={handleSaveSheetUrl} disabled={isSavingUrl} className="btn" style={{ backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--foreground)', cursor: isSavingUrl ? 'not-allowed' : 'pointer' }}>
            {isSavingUrl ? 'Saving...' : 'Save as Default'}
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="card" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <button
          onClick={handleRegenerateTasks}
          disabled={loading}
          className="btn btn-primary"
          style={{
            backgroundColor: BRAND_COLOR,
            color: 'white',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          {loading ? 'Processing...' : '🔄 Sync Now'}
        </button>
        <button
          onClick={handleClearTasks}
          disabled={loading}
          className="btn"
          style={{
            backgroundColor: 'transparent',
            border: `1px solid var(--border)`,
            color: 'var(--danger)',
            cursor: 'pointer'
          }}
        >
          🗑️ Clear All Tasks
        </button>
      </div>

      {/* Writers List */}
      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          Writers List
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.75rem 0', fontWeight: '600' }}>Writer Name</th>
                <th style={{ padding: '0.75rem 0', fontWeight: '600' }}>Email</th>
                <th style={{ padding: '0.75rem 0', fontWeight: '600', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '0.75rem 0', fontWeight: '600', textAlign: 'center' }}>GBP Clients</th>
                <th style={{ padding: '0.75rem 0', fontWeight: '600', textAlign: 'center' }}>GBP Progress</th>
                <th style={{ padding: '0.75rem 0', fontWeight: '600', textAlign: 'center' }}>Web-Off Clients</th>
                <th style={{ padding: '0.75rem 0', fontWeight: '600', textAlign: 'center' }}>Web-Off Progress</th>
              </tr>
            </thead>
            <tbody>
              {writers.map(writer => {
                const stats = getStatForWriter(writer.id);
                const gbpProgress = stats.gbp_target > 0
                  ? Math.round((stats.gbp_completed / stats.gbp_target) * 100)
                  : 0;
                const weboffProgress = stats.weboff_target > 0
                  ? Math.round((stats.weboff_completed / stats.weboff_target) * 100)
                  : 0;

                return (
                  <tr key={writer.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem 0', fontWeight: '500' }}>
                      {writer.name}
                    </td>
                    <td style={{ padding: '0.75rem 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                      {writer.email}
                    </td>
                    <td style={{ padding: '0.75rem 0', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        backgroundColor: writer.is_active ? 'rgba(34, 197, 94, 0.1)' : 'rgba(109, 114, 120, 0.1)',
                        color: writer.is_active ? 'var(--success)' : 'var(--text-muted)'
                      }}>
                        {writer.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 0', textAlign: 'center', fontWeight: '500' }}>
                      {stats.gbp_assigned_clients || 0}
                    </td>
                    <td style={{ padding: '0.75rem 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                        <div style={{ width: '80px', height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${gbpProgress}%`,
                            height: '100%',
                            backgroundColor: gbpProgress === 100 ? BRAND_COLOR : 'var(--primary)'
                          }}></div>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {stats.gbp_completed || 0} / {stats.gbp_target || 0}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 0', textAlign: 'center', fontWeight: '500' }}>
                      {stats.weboff_assigned_clients || 0}
                    </td>
                    <td style={{ padding: '0.75rem 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                        <div style={{ width: '80px', height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${weboffProgress}%`,
                            height: '100%',
                            backgroundColor: weboffProgress === 100 ? BRAND_COLOR : 'var(--success)'
                          }}></div>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {stats.weboff_completed || 0} / {stats.weboff_target || 0}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
