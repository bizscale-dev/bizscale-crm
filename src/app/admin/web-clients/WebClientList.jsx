'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { assignWebAssociate } from './actions';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';

const BRAND_COLOR = 'var(--primary)';
const UNASSIGNED = '__unassigned__';

export default function WebClientList({ webClients, webAssociates, campaign }) {
  const [assigningId, setAssigningId] = useState(null);
  const [selectedAssociate, setSelectedAssociate] = useState('');
  const [filterAssociate, setFilterAssociate] = useState('all');
  const router = useRouter();

  // Count clients per associate (and unassigned) for the filter dropdown + chips
  const counts = useMemo(() => {
    const byId = {};
    let unassigned = 0;
    webClients.forEach(c => {
      if (c.assigned_associate_id) {
        byId[c.assigned_associate_id] = (byId[c.assigned_associate_id] || 0) + 1;
      } else {
        unassigned++;
      }
    });
    return { byId, unassigned };
  }, [webClients]);

  const filteredClients = useMemo(() => {
    if (filterAssociate === 'all') return webClients;
    if (filterAssociate === UNASSIGNED) return webClients.filter(c => !c.assigned_associate_id);
    return webClients.filter(c => String(c.assigned_associate_id) === filterAssociate);
  }, [webClients, filterAssociate]);

  const handleAssign = async (clientId) => {
    if (!selectedAssociate) {
      alert('Please select a Web SEO Associate');
      return;
    }

    try {
      const result = await assignWebAssociate(clientId, parseInt(selectedAssociate));
      if (result.error) {
        alert('Error: ' + result.error);
      } else {
        setAssigningId(null);
        setSelectedAssociate('');
        router.refresh();
      }
    } catch (error) {
      alert('Error assigning associate: ' + error.message);
    }
  };

  if (webClients.length === 0) {
    return <EmptyState message="No web clients imported yet. Use the import form above to add clients from Google Sheets." />;
  }

  return (
    <div>
      {/* Filter by associate */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.875rem', fontWeight: '600' }}>Filter by Associate:</label>
          <select
            value={filterAssociate}
            onChange={(e) => setFilterAssociate(e.target.value)}
            style={{
              padding: '0.4rem 0.65rem',
              borderRadius: '0.35rem',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: '0.85rem'
            }}
          >
            <option value="all">All Associates ({webClients.length})</option>
            {webAssociates.map(assoc => (
              <option key={assoc.id} value={assoc.id}>
                {assoc.name} ({counts.byId[assoc.id] || 0})
              </option>
            ))}
            <option value={UNASSIGNED}>Unassigned ({counts.unassigned})</option>
          </select>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Showing {filteredClients.length} of {webClients.length}
          </span>
        </div>

        {/* Quick-filter chips with per-associate totals */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <FilterChip
            label={`All (${webClients.length})`}
            active={filterAssociate === 'all'}
            onClick={() => setFilterAssociate('all')}
          />
          {webAssociates.map(assoc => (
            <FilterChip
              key={assoc.id}
              label={`${assoc.name} (${counts.byId[assoc.id] || 0})`}
              active={filterAssociate === String(assoc.id)}
              onClick={() => setFilterAssociate(String(assoc.id))}
            />
          ))}
          <FilterChip
            label={`Unassigned (${counts.unassigned})`}
            active={filterAssociate === UNASSIGNED}
            onClick={() => setFilterAssociate(UNASSIGNED)}
          />
        </div>
      </div>

      {filteredClients.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>No clients match this filter.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600' }}>Business Name</th>
                <th style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600' }}>Client Name</th>
                <th style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600' }}>Status</th>
                <th style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600' }}>Assigned Associate</th>
                <th style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((client) => (
                <tr key={client.id} style={{ borderBottom: '1px solid var(--border)', opacity: client.is_active ? 1 : 0.55 }}>
                  <td style={{ padding: '0.75rem 0', fontWeight: '600' }}>{client.business_name}</td>
                  <td style={{ padding: '0.75rem 0', color: 'var(--text-muted)' }}>{client.name}</td>
                  <td style={{ padding: '0.75rem 0' }}>
                    <Badge tone={client.is_active ? 'success' : 'neutral'}>
                      {client.is_active ? 'Active' : 'Removed from sheet'}
                    </Badge>
                  </td>
                  <td style={{ padding: '0.75rem 0' }}>
                    {client.assigned_associate_name ? (
                      <Badge tone="brand">{client.assigned_associate_name}</Badge>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Not assigned</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 0' }}>
                    {assigningId === client.id ? (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <select
                          value={selectedAssociate}
                          onChange={(e) => setSelectedAssociate(e.target.value)}
                          style={{
                            padding: '0.35rem 0.5rem',
                            borderRadius: '0.25rem',
                            border: '1px solid var(--border)',
                            backgroundColor: 'var(--background)',
                            color: 'var(--foreground)',
                            fontSize: '0.75rem'
                          }}
                        >
                          <option value="">Select Associate</option>
                          {webAssociates.map(assoc => (
                            <option key={assoc.id} value={assoc.id}>{assoc.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAssign(client.id)}
                          className="btn"
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.25rem 0.5rem',
                            backgroundColor: 'var(--success)',
                            color: 'white',
                            cursor: 'pointer'
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setAssigningId(null);
                            setSelectedAssociate('');
                          }}
                          className="btn"
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.25rem 0.5rem',
                            backgroundColor: 'transparent',
                            border: '1px solid var(--border)',
                            color: 'var(--foreground)',
                            cursor: 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAssigningId(client.id)}
                        className="btn"
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem 0.5rem',
                          backgroundColor: 'var(--primary)',
                          color: 'white',
                          cursor: 'pointer'
                        }}
                      >
                        {client.assigned_associate_name ? 'Change' : 'Assign'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '0.3rem 0.7rem',
        borderRadius: '1rem',
        border: `1px solid ${active ? BRAND_COLOR : 'var(--border)'}`,
        backgroundColor: active ? 'rgba(22, 178, 147, 0.1)' : 'transparent',
        color: active ? BRAND_COLOR : 'var(--text-muted)',
        fontSize: '0.75rem',
        fontWeight: active ? '600' : '500',
        cursor: 'pointer'
      }}
    >
      {label}
    </button>
  );
}
