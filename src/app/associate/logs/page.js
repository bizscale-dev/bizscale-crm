import { getDb } from '@/lib/db';
import { getActiveCampaign, LINK_TYPE_LABELS } from '@/lib/services';
import { verifySession } from '@/lib/session';
import { deleteLink } from '../actions';

export default async function AssociateLogsPage() {
  const db = await getDb();
  const session = await verifySession();
  const userId = session.userId;
  const campaign = await getActiveCampaign();

  const logs = campaign ? await db.prepare(`
    SELECT ll.*, c.name as client_name, st.link_type, st.task_date, st.day_number
    FROM link_logs ll
    JOIN seo_tasks st ON st.id = ll.task_id
    JOIN clients c ON c.id = st.client_id
    WHERE ll.logged_by = ? AND st.campaign_id = ?
    ORDER BY ll.created_at DESC
    LIMIT 200
  `).all(userId, campaign.id) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>My Link Logs</h2>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{logs.length} total</span>
        </div>

        {!campaign ? (
          <p style={{ color: 'var(--danger)', margin: 0 }}>No active campaign.</p>
        ) : logs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No links logged yet. Go to <a href="/associate/tasks" style={{ color: 'var(--primary)' }}>My Tasks</a> to start logging.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.75rem 0' }}>Date</th>
                  <th style={{ padding: '0.75rem 0' }}>Day</th>
                  <th style={{ padding: '0.75rem 0' }}>Client</th>
                  <th style={{ padding: '0.75rem 0' }}>Type</th>
                  <th style={{ padding: '0.75rem 0' }}>URL</th>
                  <th style={{ padding: '0.75rem 0' }}>Anchor</th>
                  <th style={{ padding: '0.75rem 0' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem 0', color: 'var(--text-muted)' }}>{log.task_date}</td>
                    <td style={{ padding: '0.75rem 0', color: 'var(--text-muted)' }}>Day {log.day_number}</td>
                    <td style={{ padding: '0.75rem 0', fontWeight: '500' }}>{log.client_name}</td>
                    <td style={{ padding: '0.75rem 0' }}>{LINK_TYPE_LABELS[log.link_type] || log.link_type}</td>
                    <td style={{ padding: '0.75rem 0', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <a href={log.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>{log.url}</a>
                    </td>
                    <td style={{ padding: '0.75rem 0', color: 'var(--text-muted)' }}>{log.anchor_text || '—'}</td>
                    <td style={{ padding: '0.75rem 0' }}>
                      <form action={async () => { 'use server'; await deleteLink(log.id); }}>
                        <button type="submit" className="btn" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', backgroundColor: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)' }}
                          onClick={e => { if(!confirm('Delete this log entry?')) e.preventDefault(); }}>
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
