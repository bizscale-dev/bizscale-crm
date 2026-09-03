'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { markWebSeoCampaignCompleted, deleteWebSeoCampaign } from './actions';
import Badge from '@/components/ui/Badge';

const STATUS_TONES = { active: 'success', completed: 'neutral' };

/**
 * Every Web SEO campaign ever created, past and present — mirrors CampaignList.jsx
 * (the main SEO campaign's equivalent) so a completed Web SEO campaign can be
 * manually marked done and its real numbers stay viewable afterward, exactly the
 * same as SEO campaigns already work.
 */
export default function WebSeoCampaignHistoryList({ campaigns, activeCampaignId }) {
  const router = useRouter();

  const handleMarkCompleted = async (id, name, isActive) => {
    const warning = isActive
      ? `Mark "${name}" as completed? It's currently the active Web SEO campaign — until you start another one, nothing will be active. Its data stays fully viewable, just click View to see it.`
      : `Mark "${name}" as completed? This is manual only — no data is touched, it stays fully viewable.`;
    if (!confirm(warning)) return;

    try {
      const result = await markWebSeoCampaignCompleted(id);
      if (result.success) {
        router.refresh();
      } else if (result.error) {
        alert('Error: ' + result.error);
      }
    } catch (err) {
      alert('Error marking campaign completed: ' + err.message);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete "${name}" and all of its web clients/tasks? This cannot be undone.`)) return;

    try {
      const result = await deleteWebSeoCampaign(id);
      if (result.success) {
        router.refresh();
      } else if (result.error) {
        alert('Error: ' + result.error);
      }
    } catch (err) {
      alert('Error deleting campaign: ' + err.message);
    }
  };

  if (campaigns.length === 0) return null;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Web SEO Campaign History</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Start Date</th>
              <th style={thStyle}>Days</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map(c => {
              const isActive = c.id === activeCampaignId;
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', backgroundColor: isActive ? 'rgba(22, 178, 147, 0.05)' : 'transparent' }}>
                  <td style={tdStyle}>
                    <span style={{ fontWeight: '500' }}>{c.name}</span>
                    {isActive && <span style={{ marginLeft: '0.5rem' }}><Badge tone="brand">Active</Badge></span>}
                  </td>
                  <td style={tdStyle}><Badge tone={STATUS_TONES[c.status] || 'neutral'}>{c.status}</Badge></td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{c.start_date}</td>
                  <td style={tdStyle}>{c.total_days}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <Link href={`/admin/web-clients/campaigns/${c.id}`} className="btn" style={{ ...actionBtnStyle('transparent', 'var(--primary)', true), textDecoration: 'none', display: 'inline-block' }}>
                        View
                      </Link>
                      {c.status !== 'completed' && (
                        <button onClick={() => handleMarkCompleted(c.id, c.name, isActive)} className="btn" style={actionBtnStyle('transparent', 'var(--text-muted)', true)}>
                          Mark Completed
                        </button>
                      )}
                      <button onClick={() => handleDelete(c.id, c.name)} className="btn" style={actionBtnStyle('var(--danger)', 'white')}>
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
    </div>
  );
}

const thStyle = { padding: '0.75rem 0.5rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600' };
const tdStyle = { padding: '0.9rem 0.5rem 0.9rem 0' };

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
