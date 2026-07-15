'use client';

import { useState } from 'react';
import CampaignForm from './CampaignForm';
import { activateCampaign, deleteCampaign } from './actions';
import { useRouter } from 'next/navigation';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';

const STATUS_TONES = {
  active: 'success',
  paused: 'warning',
  completed: 'neutral',
};

export default function CampaignList({ campaigns, activeCampaignId }) {
  const [editingId, setEditingId] = useState(null);
  const router = useRouter();

  const handleDelete = async (id, name) => {
    if (!confirm(`Are you sure you want to delete the campaign "${name}"? This will delete all associated clients, tasks, and assignments. This action cannot be undone.`)) {
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

  if (campaigns.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
        <EmptyState message="No campaigns yet. Create one above to get started." />
      </div>
    );
  }

  return (
    <>
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Start Date</th>
            <th style={thStyle}>Days</th>
            <th style={thStyle}>Writer App.</th>
            <th style={thStyle}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map(c => {
            const statusTone = STATUS_TONES[c.status] || 'neutral';
            const isActive = c.id === activeCampaignId;
            return (
              <tr
                key={c.id}
                style={{
                  borderBottom: '1px solid var(--border)',
                  backgroundColor: isActive ? 'rgba(22, 178, 147, 0.05)' : 'transparent',
                }}
              >
                <td style={tdStyle}>
                  <span style={{ fontWeight: '500' }}>{c.name}</span>
                  {isActive && (
                    <span style={{ marginLeft: '0.5rem' }}>
                      <Badge tone="brand">Active</Badge>
                    </span>
                  )}
                </td>
                <td style={tdStyle}>
                  <Badge tone={statusTone}>{c.status}</Badge>
                </td>
                <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{c.start_date || '—'}</td>
                <td style={tdStyle}>{c.total_days}</td>
                <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>Approach {c.writer_approach}</td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {c.status !== 'active' && (
                      <button
                        onClick={() => activateCampaign(c.id)}
                        className="btn"
                        style={actionBtnStyle('var(--success)', 'white')}>
                        Activate
                      </button>
                    )}
                    <button
                      onClick={() => setEditingId(c.id)}
                      className="btn"
                      style={actionBtnStyle('transparent', 'var(--foreground)', true)}>
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(c.id, c.name)}
                      className="btn"
                      style={actionBtnStyle('var(--danger)', 'white')}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    {/* Edit Modal — rendered outside the overflow-x:auto table wrapper. Some browsers
        (notably Safari) don't fully exclude position:fixed descendants from an
        overflow:auto ancestor's scrollable area, which caused the table to briefly gain
        (and then lose) extra horizontal scroll room while this modal was mounted. */}
    {editingId && (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 50, padding: '1rem'
      }}>
        <div className="card" style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Edit Campaign</h3>
            <button
              onClick={() => setEditingId(null)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}
            >
              &times;
            </button>
          </div>
          <CampaignForm
            mode="edit"
            initialData={campaigns.find(c => c.id === editingId)}
            onSuccess={() => setEditingId(null)}
          />
        </div>
      </div>
    )}
    </>
  );
}

const thStyle = {
  padding: '0.75rem 0.5rem 0.75rem 0',
  textTransform: 'uppercase',
  fontSize: '0.75rem',
  fontWeight: '600',
};

const tdStyle = {
  padding: '0.9rem 0.5rem 0.9rem 0',
};

function actionBtnStyle(bg, color, bordered = false) {
  return {
    fontSize: '0.75rem',
    padding: '0.35rem 0.65rem',
    backgroundColor: bg,
    color,
    border: bordered ? '1px solid var(--border)' : 'none',
    fontWeight: '500',
  };
}
