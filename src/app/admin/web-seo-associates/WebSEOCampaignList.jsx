'use client';

import { useState } from 'react';
import WebSEOCampaignForm from './WebSEOCampaignForm';
import { activateCampaign, deleteCampaign } from '../campaign/actions';
import { useRouter } from 'next/navigation';

export default function WebSEOCampaignList({ campaigns, activeCampaignId }) {
  const [editingId, setEditingId] = useState(null);
  const router = useRouter();

  const handleDelete = async (id, name) => {
    if (!confirm(`Are you sure you want to delete the campaign "${name}"? This will delete all associated Web SEO tasks and assignments. This action cannot be undone.`)) {
      return;
    }

    try {
      const result = await deleteCampaign(id);
      if (result.success) {
        router.refresh();
      } else if (result.error) {
        alert('Error: ' + result.error);
      }
    } catch (err) {
      alert('Error deleting campaign: ' + err.message);
    }
  };

  const handleActivate = async (id) => {
    try {
      const result = await activateCampaign(id);
      if (result.success) {
        router.refresh();
      } else if (result.error) {
        alert('Error: ' + result.error);
      }
    } catch (err) {
      alert('Error activating campaign: ' + err.message);
    }
  };

  if (campaigns.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }}>No Web SEO campaigns yet. Create one above to get started.</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <th style={{ padding: '1rem 0' }}>Name</th>
            <th style={{ padding: '1rem 0' }}>Status</th>
            <th style={{ padding: '1rem 0' }}>Start Date</th>
            <th style={{ padding: '1rem 0' }}>Days</th>
            <th style={{ padding: '1rem 0' }}>Guest Posts</th>
            <th style={{ padding: '1rem 0' }}>Web 2.0 Posts</th>
            <th style={{ padding: '1rem 0' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map(c => (
            <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '1rem 0' }}>
                <span style={{ fontWeight: '500' }}>{c.name}</span>
                {c.id === activeCampaignId && (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', padding: '0.25rem 0.5rem', backgroundColor: 'var(--success)', color: 'white', borderRadius: '1rem' }}>
                    Active
                  </span>
                )}
              </td>
              <td style={{ padding: '1rem 0' }}>
                <span style={{ 
                  fontSize: '0.875rem', padding: '0.25rem 0.5rem', borderRadius: '0.25rem',
                  backgroundColor: c.status === 'active' ? 'rgba(34, 197, 94, 0.1)' : c.status === 'paused' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(100, 116, 139, 0.1)',
                  color: c.status === 'active' ? 'var(--success)' : c.status === 'paused' ? '#f59e0b' : 'var(--text-muted)'
                }}>
                  {c.status}
                </span>
              </td>
              <td style={{ padding: '1rem 0' }}>{c.start_date || '—'}</td>
              <td style={{ padding: '1rem 0' }}>{c.total_days}</td>
              <td style={{ padding: '1rem 0', fontWeight: '600', color: 'var(--primary)' }}>{c.webseo_guestpost_target || 0}</td>
              <td style={{ padding: '1rem 0', fontWeight: '600', color: 'var(--success)' }}>{c.webseo_web2_target || 0}</td>
              <td style={{ padding: '1rem 0' }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {c.status !== 'active' && (
                    <button 
                      onClick={() => handleActivate(c.id)}
                      className="btn" 
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', backgroundColor: 'var(--success)', color: 'white', cursor: 'pointer' }}>
                      Activate
                    </button>
                  )}
                  <button 
                    onClick={() => setEditingId(c.id)}
                    className="btn" 
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--foreground)', cursor: 'pointer' }}>
                    Edit
                  </button>
                  <button 
                    onClick={() => handleDelete(c.id, c.name)}
                    className="btn" 
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', backgroundColor: 'var(--danger)', color: 'white', cursor: 'pointer' }}>
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Edit Modal / Inline Edit Form */}
      {editingId && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50, padding: '1rem'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>Edit Campaign</h3>
              <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
            </div>
            <WebSEOCampaignForm 
              mode="edit" 
              initialData={campaigns.find(c => c.id === editingId)} 
              onSuccess={() => setEditingId(null)} 
            />
          </div>
        </div>
      )}
    </div>
  );
}
