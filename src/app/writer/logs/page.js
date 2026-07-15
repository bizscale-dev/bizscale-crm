import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import { verifySession } from '@/lib/session';
import { deletePost } from '../actions';

const POST_TYPE_LABELS = { guestpost: 'Guest Post', web2: 'Web 2.0', pdf: 'PDF Submission' };

export default async function WriterLogsPage() {
  const db = await getDb();
  const session = await verifySession();
  const userId = session.userId;
  const campaign = await getActiveCampaign();

  const logs = campaign ? await db.prepare(`
    SELECT wl.*, wt.post_type, wt.task_date, wt.week_number
    FROM writing_logs wl
    JOIN writing_tasks wt ON wt.id = wl.task_id
    WHERE wl.logged_by = ? AND wt.campaign_id = ?
    ORDER BY wl.created_at DESC LIMIT 200
  `).all(userId, campaign.id) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>My Post Logs</h2>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{logs.length} total</span>
        </div>

        {!campaign ? (
          <p style={{ color: 'var(--danger)', margin: 0 }}>No active campaign.</p>
        ) : logs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No posts logged yet. Go to <a href="/writer/tasks" style={{ color: 'var(--primary)' }}>My Tasks</a> to start logging.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.75rem 0' }}>Date</th>
                  <th style={{ padding: '0.75rem 0' }}>Week</th>
                  <th style={{ padding: '0.75rem 0' }}>Type</th>
                  <th style={{ padding: '0.75rem 0' }}>Title</th>
                  <th style={{ padding: '0.75rem 0' }}>Words</th>
                  <th style={{ padding: '0.75rem 0' }}>URL</th>
                  <th style={{ padding: '0.75rem 0' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem 0', color: 'var(--text-muted)' }}>{log.task_date}</td>
                    <td style={{ padding: '0.75rem 0', color: 'var(--text-muted)' }}>Week {log.week_number}</td>
                    <td style={{ padding: '0.75rem 0' }}>{POST_TYPE_LABELS[log.post_type] || log.post_type}</td>
                    <td style={{ padding: '0.75rem 0', fontWeight: '500' }}>{log.title}</td>
                    <td style={{ padding: '0.75rem 0', color: 'var(--text-muted)' }}>{log.word_count || '—'}</td>
                    <td style={{ padding: '0.75rem 0', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.url ? <a href={log.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>{log.url}</a> : '—'}
                    </td>
                    <td style={{ padding: '0.75rem 0' }}>
                      <form action={async () => { 'use server'; await deletePost(log.id); }}>
                        <button type="submit" className="btn" 
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', backgroundColor: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)' }}
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
