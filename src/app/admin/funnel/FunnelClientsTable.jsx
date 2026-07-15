'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { moveFunnelClientToNormalAction, moveFunnelClientsToNormalAction } from './actions';

const BRAND_COLOR = '#16b293';

export default function FunnelClientsTable({ funnelClients }) {
  const router = useRouter();
  const [selected, setSelected] = useState([]);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState(null);

  const allSelected = funnelClients.length > 0 && selected.length === funnelClients.length;

  const toggleAll = () => {
    setSelected(allSelected ? [] : funnelClients.map(c => c.id));
  };

  const toggleOne = (id) => {
    setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  };

  const handleMoveOne = (clientId, clientName) => {
    if (!confirm(`Move "${clientName}" straight to the normal client list? This skips any remaining funnel months.`)) return;

    setMessage(null);
    startTransition(async () => {
      const result = await moveFunnelClientToNormalAction(clientId);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setSelected(current => current.filter(x => x !== clientId));
        router.refresh();
      }
    });
  };

  const handleMoveSelected = () => {
    if (selected.length === 0) return;
    if (!confirm(`Move all ${selected.length} selected client${selected.length === 1 ? '' : 's'} straight to the normal client list? This skips any remaining funnel months.`)) return;

    setMessage(null);
    startTransition(async () => {
      const result = await moveFunnelClientsToNormalAction(selected);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: result.success });
        setSelected([]);
        router.refresh();
      }
    });
  };

  if (funnelClients.length === 0) {
    return <p style={{ color: 'var(--text-muted)', margin: 0 }}>No clients currently in the funnel.</p>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {selected.length > 0 ? `${selected.length} selected` : 'Select clients to move them in bulk'}
        </span>
        <button
          type="button"
          onClick={handleMoveSelected}
          disabled={selected.length === 0 || isPending}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: selected.length === 0 ? 'transparent' : 'var(--success)',
            color: selected.length === 0 ? 'var(--text-muted)' : 'white',
            border: selected.length === 0 ? '1px solid var(--border)' : 'none',
            borderRadius: '0.5rem',
            fontSize: '0.8rem',
            fontWeight: '600',
            cursor: selected.length === 0 || isPending ? 'not-allowed' : 'pointer',
            opacity: isPending ? 0.6 : 1
          }}
        >
          {isPending ? 'Moving...' : `Move Selected to Clients${selected.length > 0 ? ` (${selected.length})` : ''}`}
        </button>
      </div>

      {message && (
        <div style={{
          marginBottom: '1rem',
          padding: '0.6rem 0.9rem',
          borderRadius: '0.5rem',
          fontSize: '0.8rem',
          color: message.type === 'error' ? 'var(--danger)' : 'var(--success)',
          backgroundColor: message.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
          border: `1px solid ${message.type === 'error' ? 'var(--danger)' : 'var(--success)'}`
        }}>
          {message.text}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '0.75rem 0.5rem 0.75rem 0', width: '2rem' }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              </th>
              <th style={thStyle}>Client Name</th>
              <th style={thStyle}>Website</th>
              <th style={thStyle}>Month</th>
              <th style={thStyle}>Progress</th>
              <th style={thStyle}>Action</th>
            </tr>
          </thead>
          <tbody>
            {funnelClients.map((client) => {
              const taskProgress = client.total_tasks > 0 ? Math.round((client.completed_tasks / client.total_tasks) * 100) : 0;
              const isChecked = selected.includes(client.id);

              return (
                <tr key={client.id} style={{ borderBottom: '1px solid var(--border)', backgroundColor: isChecked ? 'rgba(22, 178, 147, 0.05)' : 'transparent' }}>
                  <td style={{ padding: '0.75rem 0.5rem 0.75rem 0' }}>
                    <input type="checkbox" checked={isChecked} onChange={() => toggleOne(client.id)} />
                  </td>
                  <td style={{ padding: '0.75rem 0', fontWeight: '500' }}>{client.name}</td>
                  <td style={{ padding: '0.75rem 0', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    {client.website ? <a href={client.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>{client.website}</a> : '—'}
                  </td>
                  <td style={{ padding: '0.75rem 0' }}>
                    <span style={{
                      fontSize: '0.75rem',
                      padding: '0.3rem 0.6rem',
                      backgroundColor: 'rgba(22, 178, 147, 0.1)',
                      color: BRAND_COLOR,
                      borderRadius: '0.25rem',
                      fontWeight: '600'
                    }}>
                      Month {client.funnel_month} of 3
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ width: '80px', height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ width: `${taskProgress}%`, height: '100%', backgroundColor: BRAND_COLOR }}></div>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {client.completed_tasks}/{client.total_tasks} ({taskProgress}%)
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 0' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <Link href={`/admin/funnel/${client.id}`} style={{
                        padding: '0.4rem 0.75rem',
                        backgroundColor: 'var(--primary)',
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        display: 'inline-block'
                      }}>
                        View Details
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleMoveOne(client.id, client.name)}
                        disabled={isPending}
                        style={{
                          padding: '0.4rem 0.75rem',
                          backgroundColor: 'transparent',
                          border: '1px solid var(--success)',
                          color: 'var(--success)',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          cursor: isPending ? 'not-allowed' : 'pointer',
                          opacity: isPending ? 0.6 : 1
                        }}
                      >
                        Move to Clients
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle = {
  padding: '0.75rem 0.5rem 0.75rem 0',
  textTransform: 'uppercase',
  fontSize: '0.75rem',
  fontWeight: '600',
};
