'use client';

import { useState, useMemo } from 'react';
import ClientForm from './ClientForm';
import { deleteClient, clearAllClients, deactivateClient, activateClient } from './actions';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';

export default function ClientList({ clients, associates = [] }) {
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);
  const [selectedAssociate, setSelectedAssociate] = useState(null);

  // Filter clients by selected associate
  const filteredClients = useMemo(() => {
    if (!selectedAssociate) return clients;
    return clients.filter(c => c.assigned_associate === selectedAssociate);
  }, [clients, selectedAssociate]);

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this client? This cannot be undone.')) {
      const result = await deleteClient(id);
      if (result.error) {
        setError(result.error);
      }
    }
  };

  const handleDeactivate = async (id) => {
    if (confirm('Are you sure you want to deactivate this client? It will not be counted until reactivated.')) {
      const result = await deactivateClient(id);
      if (result.error) {
        setError(result.error);
      }
    }
  };

  const handleActivate = async (id) => {
    if (confirm('Activate this client? It will be counted in calculations again.')) {
      const result = await activateClient(id);
      if (result.error) {
        setError(result.error);
      }
    }
  };

  const handleClearAll = async () => {
    if (confirm('WARNING: Are you sure you want to delete ALL clients for this campaign? This action cannot be undone.')) {
      const result = await clearAllClients();
      if (result.error) {
        setError(result.error);
      }
    }
  };

  if (clients.length === 0) {
    return <EmptyState message="No clients found for this campaign." />;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      {error && (
        <div style={{
          padding: '1rem',
          marginBottom: '1rem',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          color: 'var(--danger)',
          borderRadius: '0.25rem',
          border: '1px solid rgba(239, 68, 68, 0.3)'
        }}>
          {error}
          <button
            onClick={() => setError(null)}
            style={{
              marginLeft: '1rem',
              background: 'none',
              border: 'none',
              color: 'var(--danger)',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            ×
          </button>
        </div>
      )}

      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <label style={{ fontSize: '0.875rem', fontWeight: '500' }}>Filter by Associate:</label>
          <select
            value={selectedAssociate || ''}
            onChange={(e) => setSelectedAssociate(e.target.value || null)}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--background)',
              color: 'var(--foreground)',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            <option value="">All Associates</option>
            {associates.map(a => (
              <option key={a.id} value={a.name}>{a.name}</option>
            ))}
          </select>
          {selectedAssociate && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {filteredClients.length} / {clients.length} clients
            </span>
          )}
        </div>
        <button 
          onClick={handleClearAll}
          className="btn" 
          style={{ fontSize: '0.875rem', backgroundColor: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          Clear All Clients
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <th style={{ padding: '1rem 0' }}>Sort</th>
            <th style={{ padding: '1rem 0' }}>Client Name</th>
            <th style={{ padding: '1rem 0' }}>Associate</th>
            <th style={{ padding: '1rem 0' }}>Writer</th>
            <th style={{ padding: '1rem 0' }}>Status</th>
            <th style={{ padding: '1rem 0' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredClients.map(c => (
            <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', opacity: c.is_active ? 1 : 0.6 }}>
              <td style={{ padding: '1rem 0', color: 'var(--text-muted)' }}>{c.sort_order}</td>
              <td style={{ padding: '1rem 0', fontWeight: '500' }}>{c.name}</td>
              <td style={{ padding: '1rem 0', fontWeight: '500', color: 'var(--primary)' }}>
                {c.assigned_associate || '—'}
              </td>
              <td style={{ padding: '1rem 0', fontWeight: '500', color: 'var(--primary)' }}>
                {c.assigned_writer || '—'}
              </td>
              <td style={{ padding: '1rem 0' }}>
                <Badge tone={c.is_active ? 'success' : 'danger'}>
                  {c.is_active ? 'Active' : 'Deactivated'}
                </Badge>
              </td>
              <td style={{ padding: '1rem 0' }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button 
                    onClick={() => setEditingId(c.id)}
                    className="btn" 
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--foreground)' }}>
                    Edit
                  </button>
                  {c.is_active ? (
                    <button 
                      onClick={() => handleDeactivate(c.id)}
                      className="btn" 
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', backgroundColor: 'var(--warning)', color: 'white', border: 'none' }}>
                      Deactivate
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleActivate(c.id)}
                      className="btn" 
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', backgroundColor: 'var(--success)', color: 'white', border: 'none' }}>
                      Activate
                    </button>
                  )}
                  <button 
                    onClick={() => handleDelete(c.id)}
                    className="btn" 
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', backgroundColor: 'var(--danger)', color: 'white', border: 'none' }}>
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editingId && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50, padding: '1rem'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '600px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>Edit Client</h3>
              <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
            </div>
            <ClientForm 
              mode="edit" 
              initialData={filteredClients.find(c => c.id === editingId)} 
              onSuccess={() => setEditingId(null)} 
            />
          </div>
        </div>
      )}
    </div>
  );
}
