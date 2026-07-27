import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import Link from 'next/link';
import WritersClient from './WritersClient';

export const revalidate = 0;

export default async function WritersPage() {
  const db = await getDb();
  const campaign = await getActiveCampaign();

  let writers = [];
  let writerStats = [];
  let writersDashboard = [];

  let webSeoAssociates = [];

  if (campaign) {
    writers = await db.prepare(`
      SELECT u.id, u.name, u.email, u.is_active, u.mirrors_web_associate_id,
        COALESCE(wa.daily_post_target, 70) as daily_post_target
      FROM users u
      LEFT JOIN writer_assignments wa ON wa.user_id = u.id AND wa.campaign_id = ?
      WHERE u.role = 'writer'
      ORDER BY u.name
    `).all(campaign.id);

    webSeoAssociates = await db.prepare(`
      SELECT id, name FROM users WHERE role = 'web_seo_associate' AND is_active = 1 ORDER BY name
    `).all();

    writerStats = await db.prepare(`
      SELECT u.id, u.name,
        (SELECT COUNT(*) FROM clients WHERE assigned_writer_id = u.id AND campaign_id = ?) as assigned_clients,
        (SELECT COUNT(DISTINCT day_number) FROM writing_tasks WHERE writer_id = u.id AND campaign_id = ?) as scheduled_days,
        (SELECT SUM(target_count) FROM writing_tasks WHERE writer_id = u.id AND campaign_id = ?) as total_target_posts,
        (SELECT SUM(completed_count) FROM writing_tasks WHERE writer_id = u.id AND campaign_id = ?) as total_completed_posts,
        (SELECT SUM(target_count) FROM web_writing_tasks WHERE writer_id = u.id AND campaign_id = ?) as web_target_posts,
        (SELECT SUM(completed_count) FROM web_writing_tasks WHERE writer_id = u.id AND campaign_id = ?) as web_completed_posts
      FROM users u
      WHERE u.role = 'writer' AND u.is_active = 1
      ORDER BY u.name
    `).all(campaign.id, campaign.id, campaign.id, campaign.id, campaign.id, campaign.id);

    // Dashboard data with additional info
    writersDashboard = await db.prepare(`
      SELECT u.id, u.name, u.email, u.is_active,
        (SELECT COUNT(*) FROM clients WHERE assigned_writer_id = u.id AND campaign_id = ?) as assigned_clients,
        (SELECT COUNT(DISTINCT day_number) FROM writing_tasks WHERE writer_id = u.id AND campaign_id = ?) as scheduled_days,
        (SELECT SUM(target_count) FROM writing_tasks WHERE writer_id = u.id AND campaign_id = ?) as total_target_posts,
        (SELECT SUM(completed_count) FROM writing_tasks WHERE writer_id = u.id AND campaign_id = ?) as total_completed_posts,
        (SELECT SUM(target_count) FROM web_writing_tasks WHERE writer_id = u.id AND campaign_id = ?) as web_target_posts,
        (SELECT SUM(completed_count) FROM web_writing_tasks WHERE writer_id = u.id AND campaign_id = ?) as web_completed_posts
      FROM users u
      WHERE u.role = 'writer'
      ORDER BY u.name
    `).all(campaign.id, campaign.id, campaign.id, campaign.id, campaign.id, campaign.id);
  }

  // Get campaign-level stats
  const campaignStats = campaign ? await db.prepare(`
    SELECT
      COUNT(DISTINCT day_number) as scheduled_days,
      COUNT(*) as total_tasks,
      SUM(target_count) as total_target_posts,
      SUM(completed_count) as total_completed_posts
    FROM writing_tasks
    WHERE campaign_id = ?
  `).get(campaign.id) : { scheduled_days: 0, total_tasks: 0, total_target_posts: 0, total_completed_posts: 0 };

  const webCampaignStats = campaign ? await db.prepare(`
    SELECT
      SUM(target_count) as total_target_posts,
      SUM(completed_count) as total_completed_posts
    FROM web_writing_tasks
    WHERE campaign_id = ?
  `).get(campaign.id) : { total_target_posts: 0, total_completed_posts: 0 };

  const stats = {
    totalWriters: writers.filter(w => w.is_active).length,
    totalTasks: campaignStats.scheduled_days || 0,
    totalTargetPosts: campaignStats.total_target_posts || 0,
    totalCompletedPosts: campaignStats.total_completed_posts || 0,
    webTargetPosts: webCampaignStats.total_target_posts || 0,
    webCompletedPosts: webCampaignStats.total_completed_posts || 0,
  };

  const postsPerClient = campaign?.posts_per_client || 21;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {!campaign ? (
        <div className="card">
          <h3>No Active Campaign</h3>
          <p style={{ color: 'var(--text-muted)' }}>Please activate a campaign to manage writers.</p>
        </div>
      ) : (
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
                Total Tasks
              </h3>
              <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>
                {stats.totalTasks}
              </div>
            </div>
            <div className="card" style={{ borderLeft: '4px solid #16b293' }}>
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Target Posts
              </h3>
              <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>
                {stats.totalTargetPosts}
              </div>
            </div>
            <div className="card" style={{ borderLeft: '4px solid #16b293' }}>
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Completed Posts
              </h3>
              <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>
                {stats.totalCompletedPosts} / {stats.totalTargetPosts}
              </div>
            </div>
            <div className="card" style={{ borderLeft: '4px solid #16b293' }}>
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Web Tasks Completed
              </h3>
              <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>
                {stats.webCompletedPosts} / {stats.webTargetPosts}
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
                      <th style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600' }}>Assigned Clients</th>
                      <th style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600' }}>Posts per Client</th>
                      <th style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600' }}>Expected Posts</th>
                      <th style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600' }}>Completed</th>
                      <th style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600' }}>Progress</th>
                      <th style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600' }}>Web Tasks</th>
                      <th style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600' }}>Web Progress</th>
                      <th style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {writersDashboard.map((writer) => {
                      const expectedPosts = (writer.assigned_clients || 0) * postsPerClient;
                      const progressPercent = writer.total_target_posts > 0 ? Math.round((writer.total_completed_posts / writer.total_target_posts) * 100) : 0;
                      const webProgressPercent = writer.web_target_posts > 0 ? Math.round((writer.web_completed_posts / writer.web_target_posts) * 100) : 0;
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
                            {writer.assigned_clients || 0}
                          </td>
                          <td style={{ padding: '0.75rem 0', fontWeight: '600', color: 'var(--success)' }}>
                            {postsPerClient}
                          </td>
                          <td style={{ padding: '0.75rem 0', fontWeight: '600', color: 'var(--primary)' }}>
                            {expectedPosts}
                          </td>
                          <td style={{ padding: '0.75rem 0' }}>
                            {writer.total_completed_posts || 0}
                          </td>
                          <td style={{ padding: '0.75rem 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{ width: '80px', height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ width: `${progressPercent}%`, height: '100%', backgroundColor: 'var(--primary)' }}></div>
                              </div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{progressPercent}%</span>
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 0' }}>
                            {writer.web_completed_posts || 0} / {writer.web_target_posts || 0}
                          </td>
                          <td style={{ padding: '0.75rem 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{ width: '80px', height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ width: `${webProgressPercent}%`, height: '100%', backgroundColor: '#16b293' }}></div>
                              </div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{webProgressPercent}%</span>
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

          {/* Detailed Writer Management */}
          <WritersClient writers={writers} writerStats={writerStats} campaign={campaign} webSeoAssociates={webSeoAssociates} />
        </>
      )}
    </div>
  );
}
