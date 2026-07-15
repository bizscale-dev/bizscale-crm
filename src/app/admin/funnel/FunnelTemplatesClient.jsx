'use client';

import { useState } from 'react';
import { addFunnelTemplate, deleteFunnelTemplate } from './actions';

const BRAND_COLOR = '#16b293';
const CATEGORIES = ['Citations', 'Profiles', 'Web 2.0', 'Guest Post', 'Image Submission', 'PDF Submission'];

export default function FunnelTemplatesClient({ campaign, existingTemplates }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [templates, setTemplates] = useState(existingTemplates || []);
  const [newPlatform, setNewPlatform] = useState({ category: 'Citations', platform: '', url: '', note: '' });

  const handleAddPlatform = async () => {
    if (!newPlatform.platform) {
      setMessage({ type: 'error', text: 'Platform name is required' });
      return;
    }

    setLoading(true);
    try {
      const result = await addFunnelTemplate(campaign.id, {
        week_number: 0,
        category: newPlatform.category,
        platform: newPlatform.platform,
        url: newPlatform.url || null,
        note: newPlatform.note || null,
      });

      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Platform added successfully' });
        setNewPlatform({ category: 'Citations', platform: '', url: '', note: '' });
        window.location.reload();
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePlatform = async (templateId) => {
    if (!confirm('Remove this platform from the Month 1 checklist?')) return;

    setLoading(true);
    try {
      const result = await deleteFunnelTemplate(templateId);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Platform removed' });
        window.location.reload();
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Group templates by category (flat list, no week scheduling)
  const groupedTemplates = {};
  templates.forEach(t => {
    if (!groupedTemplates[t.category]) groupedTemplates[t.category] = [];
    groupedTemplates[t.category].push(t);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
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

      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Month 1 Checklist Manager</h3>
        <button
          onClick={() => setEditMode(!editMode)}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: editMode ? '#ef4444' : BRAND_COLOR,
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.875rem'
          }}
        >
          {editMode ? '✕ Close Editor' : '✏️ Edit Checklist'}
        </button>
      </div>

      {editMode && (
        <div className="card" style={{ backgroundColor: 'rgba(22, 178, 147, 0.05)', border: `1px solid ${BRAND_COLOR}` }}>
          <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: BRAND_COLOR }}>Add New Platform</h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                Category
              </label>
              <select
                value={newPlatform.category}
                onChange={(e) => setNewPlatform({ ...newPlatform, category: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid var(--border)',
                  borderRadius: '0.5rem',
                  backgroundColor: 'var(--background)',
                  color: 'var(--foreground)',
                  fontSize: '0.875rem'
                }}
              >
                {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                Platform Name *
              </label>
              <input
                type="text"
                value={newPlatform.platform}
                onChange={(e) => setNewPlatform({ ...newPlatform, platform: e.target.value })}
                placeholder="e.g., Medium, Quora, n49.com"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid var(--border)',
                  borderRadius: '0.5rem',
                  backgroundColor: 'var(--background)',
                  color: 'var(--foreground)',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                URL
              </label>
              <input
                type="url"
                value={newPlatform.url}
                onChange={(e) => setNewPlatform({ ...newPlatform, url: e.target.value })}
                placeholder="https://example.com"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid var(--border)',
                  borderRadius: '0.5rem',
                  backgroundColor: 'var(--background)',
                  color: 'var(--foreground)',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                Notes (e.g., requirements, special instructions)
              </label>
              <textarea
                value={newPlatform.note}
                onChange={(e) => setNewPlatform({ ...newPlatform, note: e.target.value })}
                placeholder="e.g., Requires Gmail Account, Use VPN, Optional"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid var(--border)',
                  borderRadius: '0.5rem',
                  backgroundColor: 'var(--background)',
                  color: 'var(--foreground)',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                  minHeight: '80px',
                  fontFamily: 'inherit'
                }}
              />
            </div>
          </div>

          <button
            onClick={handleAddPlatform}
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: BRAND_COLOR,
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              fontSize: '0.875rem',
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? 'Adding...' : '+ Add Platform'}
          </button>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          Month 1 Checklist ({templates.length} items)
        </h3>

        {templates.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No checklist items configured yet. Click &quot;Edit Checklist&quot; to add platforms.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {CATEGORIES.map(category => {
              const items = groupedTemplates[category] || [];
              if (items.length === 0) return null;

              return (
                <div key={category} style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: '0.5rem' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: '600', color: BRAND_COLOR, textTransform: 'uppercase', margin: '0 0 0.75rem 0' }}>
                    {category} ({items.length})
                  </p>
                  {items.map(item => (
                    <div key={item.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      padding: '0.5rem',
                      backgroundColor: 'rgba(22, 178, 147, 0.05)',
                      borderRadius: '0.25rem',
                      marginBottom: '0.5rem',
                      fontSize: '0.75rem'
                    }}>
                      <div style={{ flex: 1 }}>
                        <strong>{item.platform}</strong>
                        {item.url && (
                          <div style={{ color: 'var(--primary)', fontSize: '0.7rem', marginTop: '0.2rem' }}>
                            {item.url}
                          </div>
                        )}
                        {item.note && (
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '0.2rem' }}>
                            {item.note}
                          </div>
                        )}
                      </div>
                      {editMode && (
                        <button
                          onClick={() => handleDeletePlatform(item.id)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.25rem',
                            cursor: 'pointer',
                            fontSize: '0.7rem',
                            fontWeight: '600',
                            marginLeft: '0.5rem',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
