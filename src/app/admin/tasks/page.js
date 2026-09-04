import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import TaskActions from './TaskActions';

export const revalidate = 0;

export default async function TasksPage() {
  const db = await getDb();
  const campaign = await getActiveCampaign();

  let seoTaskSummary = [];
  let writingTaskSummary = [];
  let webSeoTaskSummary = [];

  if (campaign) {
    // "clients" here is that day's real scheduled client count (from the actual
    // generated rotation), and "target"/"completed" are the real per-day sums —
    // not an estimate. Previously this queried a separate, unused
    // "assigned_clients" (the associate's whole roster, constant across every
    // day) and displayed a rough (assigned_clients × 50) / 16 formula instead of
    // the real target this query already had on hand, which is why the numbers
    // shown here didn't match the real day-to-day rotation.
    seoTaskSummary = await db.prepare(`
      SELECT u.id, u.name as associate_name, st.day_number, st.task_date,
        SUM(st.target_count) as target, SUM(st.completed_count) as completed,
        COUNT(DISTINCT st.client_id) as clients
      FROM seo_tasks st JOIN users u ON u.id = st.associate_id
      WHERE st.campaign_id = ?
      GROUP BY st.associate_id, st.day_number
      ORDER BY st.day_number, u.name
    `).all(campaign.id);

    writingTaskSummary = await db.prepare(`
      SELECT u.name as writer_name, wt.week_number, wt.day_number, wt.task_date, wt.post_type,
        SUM(wt.target_count) as target, SUM(wt.completed_count) as completed
      FROM writing_tasks wt JOIN users u ON u.id = wt.writer_id
      WHERE wt.campaign_id = ?
      GROUP BY wt.writer_id, wt.day_number, wt.post_type
      ORDER BY wt.day_number, u.name
    `).all(campaign.id);

    webSeoTaskSummary = await db.prepare(`
      SELECT u.id, u.name as associate_name, wst.day_number, wst.task_date, wst.post_type,
        SUM(wst.target_count) as target, SUM(wst.completed_count) as completed,
        COUNT(DISTINCT wst.client_id) as clients,
        (SELECT COUNT(*) FROM web_clients WHERE assigned_associate_id = u.id AND campaign_id = ? AND is_active = 1) as assigned_clients
      FROM webseo_tasks wst JOIN users u ON u.id = wst.associate_id
      WHERE wst.campaign_id = ?
      GROUP BY wst.associate_id, wst.day_number, wst.post_type
      ORDER BY wst.day_number, u.name
    `).all(campaign.id, campaign.id);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {!campaign ? (
        <div className="card">
          <p style={{ color: 'var(--danger)', margin: 0 }}>
            No active campaign found. You must activate a campaign before managing tasks.
          </p>
        </div>
      ) : (
        <>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Task Generation</h2>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>
              Generate daily SEO and Writing tasks for the duration of the campaign based on the target settings and assigned users. This will overwrite any uncompleted tasks.
            </p>
            <TaskActions />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
            <div className="card">
              <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                SEO Task Summary
              </h2>
              {seoTaskSummary.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No SEO tasks generated yet.</p>
              ) : (
                <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--card-bg)' }}>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '0.75rem 0' }}>Day</th>
                        <th style={{ padding: '0.75rem 0' }}>Date</th>
                        <th style={{ padding: '0.75rem 0' }}>Associate</th>
                        <th style={{ padding: '0.75rem 0' }}>Clients Scheduled</th>
                        <th style={{ padding: '0.75rem 0' }}>Target</th>
                        <th style={{ padding: '0.75rem 0' }}>Completed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {seoTaskSummary.map((t, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.75rem 0' }}>Day {t.day_number}</td>
                          <td style={{ padding: '0.75rem 0' }}>{t.task_date}</td>
                          <td style={{ padding: '0.75rem 0', fontWeight: '500' }}>{t.associate_name}</td>
                          <td style={{ padding: '0.75rem 0' }}>{t.clients}</td>
                          <td style={{ padding: '0.75rem 0', fontWeight: '600', color: 'var(--primary)' }}>{t.target}</td>
                          <td style={{ padding: '0.75rem 0', color: 'var(--success)' }}>{t.completed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card">
              <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                Writing Task Summary
              </h2>
              {writingTaskSummary.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No Writing tasks generated yet.</p>
              ) : (
                <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--card-bg)' }}>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '0.75rem 0' }}>Day</th>
                        <th style={{ padding: '0.75rem 0' }}>Date</th>
                        <th style={{ padding: '0.75rem 0' }}>Writer</th>
                        <th style={{ padding: '0.75rem 0' }}>Post Type</th>
                        <th style={{ padding: '0.75rem 0' }}>Posts Target</th>
                      </tr>
                    </thead>
                    <tbody>
                      {writingTaskSummary.map((t, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.75rem 0' }}>Day {t.day_number}</td>
                          <td style={{ padding: '0.75rem 0' }}>{t.task_date}</td>
                          <td style={{ padding: '0.75rem 0', fontWeight: '500' }}>{t.writer_name}</td>
                          <td style={{ padding: '0.75rem 0', textTransform: 'capitalize' }}>{t.post_type}</td>
                          <td style={{ padding: '0.75rem 0', color: 'var(--success)' }}>{t.target}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card">
              <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                Web SEO Task Summary
              </h2>
              {webSeoTaskSummary.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No Web SEO tasks generated yet.</p>
              ) : (
                <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--card-bg)' }}>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '0.75rem 1rem 0.75rem 0', whiteSpace: 'nowrap' }}>Day</th>
                        <th style={{ padding: '0.75rem 1rem 0.75rem 0', whiteSpace: 'nowrap' }}>Date</th>
                        <th style={{ padding: '0.75rem 1rem 0.75rem 0', whiteSpace: 'nowrap' }}>Associate</th>
                        <th style={{ padding: '0.75rem 1rem 0.75rem 0', whiteSpace: 'nowrap' }}>Post Type</th>
                        <th style={{ padding: '0.75rem 1rem 0.75rem 0', whiteSpace: 'nowrap' }}>Assigned Clients</th>
                        <th style={{ padding: '0.75rem 1rem 0.75rem 0', whiteSpace: 'nowrap' }}>Target</th>
                        <th style={{ padding: '0.75rem 0', whiteSpace: 'nowrap' }}>Completed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {webSeoTaskSummary.map((t, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.75rem 1rem 0.75rem 0', whiteSpace: 'nowrap' }}>Day {t.day_number}</td>
                          <td style={{ padding: '0.75rem 1rem 0.75rem 0', whiteSpace: 'nowrap' }}>{t.task_date}</td>
                          <td style={{ padding: '0.75rem 1rem 0.75rem 0', fontWeight: '500', whiteSpace: 'nowrap' }}>{t.associate_name}</td>
                          <td style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{t.post_type}</td>
                          <td style={{ padding: '0.75rem 1rem 0.75rem 0', whiteSpace: 'nowrap' }}>{t.assigned_clients}</td>
                          <td style={{ padding: '0.75rem 1rem 0.75rem 0', fontWeight: '600', color: 'var(--primary)', whiteSpace: 'nowrap' }}>{t.target}</td>
                          <td style={{ padding: '0.75rem 0', color: 'var(--success)', whiteSpace: 'nowrap' }}>{t.completed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
