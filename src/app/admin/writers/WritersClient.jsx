'use client';

import { useState } from 'react';
import { regenerateWriterTasks, clearWriterTasks, createWriterCampaign, toggleWriterCampaignOffDayAction } from './actions';
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

export default function WritersClient({ writers, writerStats, writerOffpageSheetUrl = '', writerCampaign = null, writerCampaignOffDays = [] }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [sheetUrl, setSheetUrl] = useState(writerOffpageSheetUrl);
  const [isSavingUrl, setIsSavingUrl] = useState(false);
  const [creatingWriterCampaign, setCreatingWriterCampaign] = useState(false);
  const [newStartDate, setNewStartDate] = useState('');
  const [newTotalDays, setNewTotalDays] = useState(16);
  const [newOffDate, setNewOffDate] = useState('');

  const handleCreateWriterCampaign = async () => {
    if (!newStartDate) {
      setMessage({ type: 'error', text: 'Pick a start date for the writer campaign' });
      return;
    }
    if (!confirm(`Start a new writer campaign on ${newStartDate}? This ends the current writer campaign (if any) and generates a fresh schedule from the sheet.`)) return;

    setCreatingWriterCampaign(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.set('start_date', newStartDate);
      formData.set('total_days', newTotalDays);
      const result = await createWriterCampaign(null, formData);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: result.success });
        window.location.reload();
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setCreatingWriterCampaign(false);
    }
  };

  const handleAddOffDay = async () => {
    if (!newOffDate) return;
    try {
      const result = await toggleWriterCampaignOffDayAction(newOffDate);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setNewOffDate('');
        window.location.reload();
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleRemoveOffDay = async (dateStr) => {
    try {
      const result = await toggleWriterCampaignOffDayAction(dateStr);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        window.location.reload();
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

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

      {/* Writer Campaign — independent of the main campaign, so writers can start
          their rotation ahead of the associate-facing campaign. */}
      <div className="card" style={{ border: `1px solid ${BRAND_COLOR}` }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Writer Campaign</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0 0 1rem 0' }}>
          Controls the writers&apos; GBP-Off/Web-Off rotation independently of the main campaign — start it whenever you want writers to begin, even before the next main campaign exists.
        </p>

        {writerCampaign ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', fontSize: '0.875rem' }}>
              <div><strong>Status:</strong> {writerCampaign.status}</div>
              <div><strong>Start Date:</strong> {writerCampaign.start_date}</div>
              <div><strong>Total Days:</strong> {writerCampaign.total_days}</div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', fontWeight: '500' }}>Off Days</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                {writerCampaignOffDays.length === 0 ? (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>None set</span>
                ) : (
                  writerCampaignOffDays.map(od => (
                    <span key={od.off_date} style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                      padding: '0.25rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem',
                      backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b',
                    }}>
                      {od.off_date}
                      <button onClick={() => handleRemoveOffDay(od.off_date)} style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', fontWeight: '700', padding: 0 }}>×</button>
                    </span>
                  ))
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="date" value={newOffDate} onChange={(e) => setNewOffDate(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
                <button onClick={handleAddOffDay} className="btn" style={{ backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--foreground)', cursor: 'pointer' }}>
                  Add Off Day
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>No active writer campaign — start one below.</p>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', fontWeight: '500' }}>Start Date</label>
            <input type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', fontWeight: '500' }}>Total Days</label>
            <input type="number" min="1" value={newTotalDays} onChange={(e) => setNewTotalDays(e.target.value)} style={{ ...inputStyle, width: '100px' }} />
          </div>
          <button onClick={handleCreateWriterCampaign} disabled={creatingWriterCampaign} className="btn btn-primary" style={{ backgroundColor: BRAND_COLOR, color: 'white', border: 'none', cursor: creatingWriterCampaign ? 'not-allowed' : 'pointer' }}>
            {creatingWriterCampaign ? 'Starting...' : (writerCampaign ? 'Start New Writer Campaign' : 'Start Writer Campaign')}
          </button>
        </div>
      </div>

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
          disabled={loading || !writerCampaign}
          className="btn btn-primary"
          style={{
            backgroundColor: BRAND_COLOR,
            color: 'white',
            border: 'none',
            cursor: (loading || !writerCampaign) ? 'not-allowed' : 'pointer',
            opacity: writerCampaign ? 1 : 0.5,
          }}
        >
          {loading ? 'Processing...' : '🔄 Sync Now'}
        </button>
        <button
          onClick={handleClearTasks}
          disabled={loading || !writerCampaign}
          className="btn"
          style={{
            backgroundColor: 'transparent',
            border: `1px solid var(--border)`,
            color: 'var(--danger)',
            cursor: (loading || !writerCampaign) ? 'not-allowed' : 'pointer',
            opacity: writerCampaign ? 1 : 0.5,
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
