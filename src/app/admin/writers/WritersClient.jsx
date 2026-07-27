'use client';

import { useState, useTransition } from 'react';
import { regenerateWriterTasks, clearWriterTasks, setWriterMirrorsAssociate } from './actions';

const BRAND_COLOR = '#16b293';

export default function WritersClient({ writers, writerStats, campaign, webSeoAssociates = [] }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [isPending, startTransition] = useTransition();

  const handleMirrorChange = (writerId, associateId) => {
    startTransition(async () => {
      const result = await setWriterMirrorsAssociate(writerId, associateId ? parseInt(associateId, 10) : null);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        window.location.reload();
      }
    });
  };

  const handleRegenerateTasks = async () => {
    if (!confirm('Regenerate writer tasks? This will recalculate all client rotations.')) return;
    
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
    if (!confirm('Clear all writer tasks? This cannot be undone.')) return;
    
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
          {loading ? 'Processing...' : '🔄 Regenerate Writer Tasks'}
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

      {/* Campaign Settings Info */}
      <div className="card" style={{ backgroundColor: 'rgba(22, 178, 147, 0.05)', border: `1px solid ${BRAND_COLOR}` }}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem', color: BRAND_COLOR }}>Campaign Configuration</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Posts per Client/Month</p>
            <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600', color: BRAND_COLOR }}>
              {campaign.posts_per_client || 21}
            </p>
          </div>
          <div>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Clients per Day (Rotation)</p>
            <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600', color: BRAND_COLOR }}>
              {campaign.writer_clients_per_day || 8}
            </p>
          </div>
          <div>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Team Daily Target</p>
            <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600', color: BRAND_COLOR }}>
              {campaign.writers_daily_target || 105} posts/day
            </p>
          </div>
        </div>
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
                <th style={{ padding: '0.75rem 0', fontWeight: '600', textAlign: 'center' }}>Assigned Clients</th>
                <th style={{ padding: '0.75rem 0', fontWeight: '600', textAlign: 'center' }}>Posts Progress</th>
                <th style={{ padding: '0.75rem 0', fontWeight: '600', textAlign: 'center' }}>Web Tasks Progress</th>
                <th style={{ padding: '0.75rem 0', fontWeight: '600', textAlign: 'center' }}>Web Tasks — Mirrors Associate</th>
              </tr>
            </thead>
            <tbody>
              {writers.map(writer => {
                const stats = getStatForWriter(writer.id);
                const progress = stats.total_target_posts > 0
                  ? Math.round((stats.total_completed_posts / stats.total_target_posts) * 100)
                  : 0;
                const webProgress = stats.web_target_posts > 0
                  ? Math.round((stats.web_completed_posts / stats.web_target_posts) * 100)
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
                      {stats.assigned_clients || 0}
                    </td>
                    <td style={{ padding: '0.75rem 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                        <div style={{ width: '80px', height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${progress}%`,
                            height: '100%',
                            backgroundColor: progress === 100 ? BRAND_COLOR : 'var(--primary)'
                          }}></div>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {stats.total_completed_posts || 0} / {stats.total_target_posts || 0}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                        <div style={{ width: '80px', height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${webProgress}%`,
                            height: '100%',
                            backgroundColor: webProgress === 100 ? BRAND_COLOR : 'var(--primary)'
                          }}></div>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {stats.web_completed_posts || 0} / {stats.web_target_posts || 0}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 0', textAlign: 'center' }}>
                      <select
                        defaultValue={writer.mirrors_web_associate_id || ''}
                        disabled={isPending}
                        onChange={(e) => handleMirrorChange(writer.id, e.target.value)}
                        style={{
                          padding: '0.35rem 0.5rem',
                          borderRadius: '0.375rem',
                          border: '1px solid var(--border)',
                          backgroundColor: 'var(--background)',
                          color: 'var(--foreground)',
                          fontSize: '0.8rem',
                        }}
                      >
                        <option value="">None</option>
                        {webSeoAssociates.map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
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
