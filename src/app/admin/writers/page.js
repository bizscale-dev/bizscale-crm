import { getDb } from '@/lib/db';
import { getActiveWriterCampaign } from '@/lib/services';
import { listOffDays } from '@/lib/writerCampaignOffDays';
import Link from 'next/link';
import WritersClient from './WritersClient';
import WriterCampaignHistoryList from './WriterCampaignHistoryList';

export const revalidate = 0;

export default async function WritersPage() {
  const db = await getDb();
  const writerCampaign = await getActiveWriterCampaign();
  const allWriterCampaigns = await db.prepare('SELECT * FROM writer_campaigns ORDER BY id DESC').all();

  let writerStats = [];
  let writersDashboard = [];
  let writerOffpageSheetUrl = '';
  let writerCampaignOffDays = [];

  const sheetSetting = await db.prepare("SELECT value FROM settings WHERE key = ?").get('writer_offpage_sheet_url');
  writerOffpageSheetUrl = sheetSetting?.value || '';

  if (writerCampaign) {
    // GBP-Off Page / Web-Off Page — sourced from the Google Sheet tabs (see
    // src/lib/writerOffpageSync.js). Assigned clients come from
    // writer_offpage_assignments, not the old clients.assigned_writer_id.
    writerStats = await db.prepare(`
      SELECT u.id, u.name,
        (SELECT COUNT(*) FROM writer_offpage_assignments WHERE writer_id = u.id AND writer_campaign_id = ? AND task_type = 'gbp') as gbp_assigned_clients,
        (SELECT SUM(target_count) FROM writer_offpage_tasks WHERE writer_id = u.id AND writer_campaign_id = ? AND task_type = 'gbp') as gbp_target,
        (SELECT SUM(completed_count) FROM writer_offpage_tasks WHERE writer_id = u.id AND writer_campaign_id = ? AND task_type = 'gbp') as gbp_completed,
        (SELECT COUNT(*) FROM writer_offpage_assignments WHERE writer_id = u.id AND writer_campaign_id = ? AND task_type = 'weboff') as weboff_assigned_clients,
        (SELECT SUM(target_count) FROM writer_offpage_tasks WHERE writer_id = u.id AND writer_campaign_id = ? AND task_type = 'weboff') as weboff_target,
        (SELECT SUM(completed_count) FROM writer_offpage_tasks WHERE writer_id = u.id AND writer_campaign_id = ? AND task_type = 'weboff') as weboff_completed
      FROM users u
      WHERE u.role = 'writer' AND u.is_active = 1
      ORDER BY u.name
    `).all(writerCampaign.id, writerCampaign.id, writerCampaign.id, writerCampaign.id, writerCampaign.id, writerCampaign.id);

    // Dashboard data with additional info
    writersDashboard = await db.prepare(`
      SELECT u.id, u.name, u.email, u.is_active,
        (SELECT COUNT(*) FROM writer_offpage_assignments WHERE writer_id = u.id AND writer_campaign_id = ? AND task_type = 'gbp') as gbp_assigned_clients,
        (SELECT SUM(target_count) FROM writer_offpage_tasks WHERE writer_id = u.id AND writer_campaign_id = ? AND task_type = 'gbp') as gbp_target,
        (SELECT SUM(completed_count) FROM writer_offpage_tasks WHERE writer_id = u.id AND writer_campaign_id = ? AND task_type = 'gbp') as gbp_completed,
        (SELECT COUNT(*) FROM writer_offpage_assignments WHERE writer_id = u.id AND writer_campaign_id = ? AND task_type = 'weboff') as weboff_assigned_clients,
        (SELECT SUM(target_count) FROM writer_offpage_tasks WHERE writer_id = u.id AND writer_campaign_id = ? AND task_type = 'weboff') as weboff_target,
        (SELECT SUM(completed_count) FROM writer_offpage_tasks WHERE writer_id = u.id AND writer_campaign_id = ? AND task_type = 'weboff') as weboff_completed
      FROM users u
      WHERE u.role = 'writer'
      ORDER BY u.name
    `).all(writerCampaign.id, writerCampaign.id, writerCampaign.id, writerCampaign.id, writerCampaign.id, writerCampaign.id);

    writerCampaignOffDays = await listOffDays(writerCampaign.id);
  }

  // Get writer-campaign-level stats
  const gbpCampaignStats = writerCampaign ? await db.prepare(`
    SELECT SUM(target_count) as total_target_posts, SUM(completed_count) as total_completed_posts
    FROM writer_offpage_tasks WHERE writer_campaign_id = ? AND task_type = 'gbp'
  `).get(writerCampaign.id) : { total_target_posts: 0, total_completed_posts: 0 };

  const weboffCampaignStats = writerCampaign ? await db.prepare(`
    SELECT SUM(target_count) as total_target_posts, SUM(completed_count) as total_completed_posts
    FROM writer_offpage_tasks WHERE writer_campaign_id = ? AND task_type = 'weboff'
  `).get(writerCampaign.id) : { total_target_posts: 0, total_completed_posts: 0 };

  const stats = {
    totalWriters: writersDashboard.filter(w => w.is_active).length,
    gbpTargetPosts: gbpCampaignStats.total_target_posts || 0,
    gbpCompletedPosts: gbpCampaignStats.total_completed_posts || 0,
    weboffTargetPosts: weboffCampaignStats.total_target_posts || 0,
    weboffCompletedPosts: weboffCampaignStats.total_completed_posts || 0,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {!writerCampaign && (
        <div className="card">
          <h3>No Active Writer Campaign</h3>
          <p style={{ color: 'var(--text-muted)' }}>Start one below to manage writers.</p>
        </div>
      )}
      {writerCampaign && (
        <>
          {/* Stats Overview */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
            <div className="card" style={{ borderLeft: '4px solid #16b293' }}>
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Active Writers
              </h3>
              <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>
                {stats.totalWriters}
              </div>
            </div>
            <div className="card" style={{ borderLeft: '4px solid #16b293' }}>
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                GBP-Off Completed
              </h3>
              <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>
                {stats.gbpCompletedPosts} / {stats.gbpTargetPosts}
              </div>
            </div>
            <div className="card" style={{ borderLeft: '4px solid #16b293' }}>
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Web-Off Completed
              </h3>
              <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>
                {stats.weboffCompletedPosts} / {stats.weboffTargetPosts}
              </div>
            </div>
          </div>

          {/* Writers Dashboard Table */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Writers Dashboard</h2>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{writersDashboard.length} total</span>
            </div>

            {writersDashboard.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>No writers found.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600' }}>Name</th>
                      <th style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600' }}>Email</th>
                      <th style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600' }}>Status</th>
                      <th style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600' }}>GBP Clients</th>
                      <th style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600' }}>GBP Progress</th>
                      <th style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600' }}>Web-Off Clients</th>
                      <th style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600' }}>Web-Off Progress</th>
                      <th style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {writersDashboard.map((writer) => {
                      const gbpProgressPercent = writer.gbp_target > 0 ? Math.round((writer.gbp_completed / writer.gbp_target) * 100) : 0;
                      const weboffProgressPercent = writer.weboff_target > 0 ? Math.round((writer.weboff_completed / writer.weboff_target) * 100) : 0;
                      return (
                        <tr key={writer.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.75rem 0', fontWeight: '500' }}>{writer.name}</td>
                          <td style={{ padding: '0.75rem 0', color: 'var(--text-muted)' }}>{writer.email}</td>
                          <td style={{ padding: '0.75rem 0' }}>
                            <span style={{
                              padding: '0.25rem 0.5rem',
                              backgroundColor: writer.is_active ? 'rgba(34, 197, 94, 0.1)' : 'rgba(156, 163, 175, 0.1)',
                              color: writer.is_active ? 'var(--success)' : 'var(--text-muted)',
                              borderRadius: '0.25rem',
                              fontSize: '0.75rem',
                              fontWeight: '500'
                            }}>
                              {writer.is_active ? 'active' : 'inactive'}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 0', fontWeight: '600', color: 'var(--primary)' }}>
                            {writer.gbp_assigned_clients || 0}
                          </td>
                          <td style={{ padding: '0.75rem 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{ width: '80px', height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ width: `${gbpProgressPercent}%`, height: '100%', backgroundColor: 'var(--primary)' }}></div>
                              </div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                {writer.gbp_completed || 0}/{writer.gbp_target || 0} ({gbpProgressPercent}%)
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 0', fontWeight: '600', color: 'var(--success)' }}>
                            {writer.weboff_assigned_clients || 0}
                          </td>
                          <td style={{ padding: '0.75rem 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{ width: '80px', height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ width: `${weboffProgressPercent}%`, height: '100%', backgroundColor: 'var(--success)' }}></div>
                              </div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                {writer.weboff_completed || 0}/{writer.weboff_target || 0} ({weboffProgressPercent}%)
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 0' }}>
                            <Link href={`/admin/writers/${writer.id}`} style={{
                              padding: '0.4rem 0.75rem',
                              backgroundColor: 'var(--primary)',
                              color: 'white',
                              textDecoration: 'none',
                              borderRadius: '0.25rem',
                              fontSize: '0.75rem',
                              fontWeight: '500',
                              transition: 'opacity 0.2s',
                              display: 'inline-block',
                              cursor: 'pointer',
                              border: 'none'
                            }}>
                              View
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Detailed Writer Management — always rendered, even with no active writer
          campaign yet, since this is where a new one gets started. */}
      <WritersClient
        writerStats={writerStats}
        writerOffpageSheetUrl={writerOffpageSheetUrl}
        writerCampaign={writerCampaign}
        writerCampaignOffDays={writerCampaignOffDays}
      />

      <WriterCampaignHistoryList campaigns={allWriterCampaigns} activeCampaignId={writerCampaign?.id} />
    </div>
  );
}
