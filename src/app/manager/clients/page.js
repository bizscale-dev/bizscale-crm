import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';

export default async function ManagerClientsPage() {
  const db = await getDb();
  const campaign = await getActiveCampaign();

  const clients = campaign ? await db.prepare(`
    SELECT c.*, u.name as associate_name,
      SUM(st.target_count) as target, SUM(st.completed_count) as completed
    FROM clients c
    LEFT JOIN seo_tasks st ON st.client_id = c.id AND st.campaign_id = ?
    LEFT JOIN users u ON u.id = st.associate_id
    WHERE c.campaign_id = ?
    GROUP BY c.id ORDER BY c.sort_order
  `).all(campaign.id, campaign.id) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Client Progress</h2>

      {!campaign ? (
        <div className="card"><p style={{ color: 'var(--danger)', margin: 0 }}>No active campaign found.</p></div>
      ) : clients.length === 0 ? (
        <div className="card"><p style={{ color: 'var(--text-muted)', margin: 0 }}>No clients found for this campaign.</p></div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '1rem 0' }}>Sort</th>
                <th style={{ padding: '1rem 0' }}>Client</th>
                <th style={{ padding: '1rem 0' }}>Website</th>
                <th style={{ padding: '1rem 0' }}>Niche</th>
                <th style={{ padding: '1rem 0' }}>Associate</th>
                <th style={{ padding: '1rem 0' }}>SEO Progress</th>
                <th style={{ padding: '1rem 0' }}>%</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => {
                const pct = c.target > 0 ? Math.round((c.completed / c.target) * 100) : 0;
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '1rem 0', color: 'var(--text-muted)' }}>{c.sort_order}</td>
                    <td style={{ padding: '1rem 0', fontWeight: '500' }}>{c.name}</td>
                    <td style={{ padding: '1rem 0' }}>
                      {c.website ? (
                        <a href={c.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                          {c.website}
                        </a>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '1rem 0', color: 'var(--text-muted)' }}>{c.niche || '—'}</td>
                    <td style={{ padding: '1rem 0' }}>{c.associate_name || '—'}</td>
                    <td style={{ padding: '1rem 0', width: '160px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ flex: 1, height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: pct >= 100 ? 'var(--success)' : 'var(--primary)' }}></div>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{c.completed || 0}/{c.target || 0}</span>
                      </div>
                    </td>
                    <td style={{ padding: '1rem 0', fontWeight: '600', color: pct >= 100 ? 'var(--success)' : 'var(--foreground)' }}>{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
