'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { enrollClientInFunnelAction, enrollHeldClientAtMonthAction, moveHeldClientToNormalAction } from './actions';

const BRAND_COLOR = '#16b293';

const inputStyle = {
  padding: '0.4rem 0.6rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: '0.8rem',
};

// Clients that landed on hold instead of auto-joining the Funnel (see
// src/lib/funnel.js) — each row lets the admin place that client into Funnel
// Month 1 (optionally starting at a later week), skip straight to Month 2/3, or
// bypass the Funnel entirely into the normal client list.
export default function FunnelHoldClientsTable({ holdClients, campaignId }) {
  const router = useRouter();
  const [startWeekByClient, setStartWeekByClient] = useState({});
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState(null);

  const handleAddMonth1 = (clientId, clientName) => {
    const startWeek = startWeekByClient[clientId] || 1;
    setMessage(null);
    startTransition(async () => {
      const result = await enrollClientInFunnelAction(clientId, campaignId, startWeek);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: `${clientName}: ${result.success}` });
        router.refresh();
      }
    });
  };

  const handleAddAtMonth = (clientId, clientName, targetMonth) => {
    if (!confirm(`Place "${clientName}" directly into Month ${targetMonth}? Month 1${targetMonth === 3 ? ' and Month 2' : ''} tasks are never generated for them.`)) return;

    setMessage(null);
    startTransition(async () => {
      const result = await enrollHeldClientAtMonthAction(clientId, campaignId, targetMonth);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: `${clientName}: ${result.success}` });
        router.refresh();
      }
    });
  };

  const handleMoveToNormal = (clientId, clientName) => {
    if (!confirm(`Move "${clientName}" straight to the normal client list, skipping the Funnel entirely?`)) return;

    setMessage(null);
    startTransition(async () => {
      const result = await moveHeldClientToNormalAction(clientId, campaignId);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: `${clientName}: ${result.success}` });
        router.refresh();
      }
    });
  };

  if (holdClients.length === 0) {
    return <p style={{ color: 'var(--text-muted)', margin: 0 }}>No clients on hold.</p>;
  }

  return (
    <div>
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
              <th style={thStyle}>Client Name</th>
              <th style={thStyle}>Website</th>
              <th style={thStyle}>Start at Week</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {holdClients.map((client) => (
              <tr key={client.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '0.75rem 0', fontWeight: '500' }}>{client.name}</td>
                <td style={{ padding: '0.75rem 0', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  {client.website ? <a href={client.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>{client.website}</a> : '—'}
                </td>
                <td style={{ padding: '0.75rem 0' }}>
                  <select
                    value={startWeekByClient[client.id] || 1}
                    onChange={(e) => setStartWeekByClient(current => ({ ...current, [client.id]: parseInt(e.target.value, 10) }))}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value={1}>Week 1</option>
                    <option value={2}>Week 2</option>
                    <option value={3}>Week 3</option>
                    <option value={4}>Week 4</option>
                  </select>
                </td>
                <td style={{ padding: '0.75rem 0' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleAddMonth1(client.id, client.name)}
                      disabled={isPending}
                      style={{
                        padding: '0.4rem 0.75rem',
                        backgroundColor: '#f59e0b',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        cursor: isPending ? 'not-allowed' : 'pointer',
                        opacity: isPending ? 0.6 : 1,
                      }}
                    >
                      {isPending ? 'Working...' : 'Add to Month 1'}
                    </button>
                    {[2, 3].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => handleAddAtMonth(client.id, client.name, m)}
                        disabled={isPending}
                        style={{
                          padding: '0.4rem 0.75rem',
                          backgroundColor: 'transparent',
                          border: `1px solid ${BRAND_COLOR}`,
                          color: BRAND_COLOR,
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          cursor: isPending ? 'not-allowed' : 'pointer',
                          opacity: isPending ? 0.6 : 1,
                        }}
                      >
                        Add to Month {m}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleMoveToNormal(client.id, client.name)}
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
                        opacity: isPending ? 0.6 : 1,
                      }}
                    >
                      Move to Regular Clients
                    </button>
                  </div>
                </td>
              </tr>
            ))}
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
