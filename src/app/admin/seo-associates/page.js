import { getDb } from '@/lib/db';
import Link from 'next/link';
import { getActiveCampaign, getTotalLinksPerClient } from '@/lib/services';

export default async function SEOAssociatesPage() {
  const db = await getDb();

  // Monthly target per client comes from the active campaign's configured link
  // targets (web2 + guestpost + pdf + profile + citation + image), not a fixed number.
  const campaign = await getActiveCampaign();
  const monthlyTargetPerClient = campaign ? getTotalLinksPerClient(campaign) : 0;

  // Get all SEO associates with client and task information — scoped to the active
  // campaign only (a client/task from a past campaign shouldn't count here), and
  // excluding clients currently in the Funnel (they don't get regular seo_tasks).
  const associates = campaign ? await db.prepare(`
    SELECT u.id, u.name, u.email, u.is_active, u.lifetime_completed_links,
      (SELECT COUNT(*) FROM seo_tasks WHERE associate_id = u.id AND campaign_id = ?) as total_tasks,
      (SELECT SUM(completed_count) FROM seo_tasks WHERE associate_id = u.id AND campaign_id = ?) as completed_tasks,
      (SELECT COUNT(*) FROM clients WHERE assigned_associate_id = u.id AND campaign_id = ?
         AND (tunnel_status IS NULL OR tunnel_status != 'active')) as total_clients
    FROM users u
    WHERE u.role IN ('seo_associate', 'associate')
    ORDER BY u.name ASC
  `).all(campaign.id, campaign.id, campaign.id) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>SEO Associates</h2>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{associates.length} total</span>
        </div>

        {!campaign ? (
          <p style={{ color: 'var(--danger)', margin: 0 }}>No active campaign.</p>
        ) : associates.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>No SEO associates found.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' }}>Name</th>
                  <th style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' }}>Email</th>
                  <th style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' }}>Total Clients</th>
                  <th style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' }}>Total Tasks Per Client</th>
                  <th style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' }}>Total Expected Links</th>
                  <th style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' }}>Completed</th>
                  <th style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' }}>All-Time (Sheet)</th>
                  <th style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' }}>Progress</th>
                  <th style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {associates.map((associate) => {
                  const expectedTotalLinks = associate.total_clients * monthlyTargetPerClient;
                  // seo_tasks rows (and their completed_count) get wiped and rebuilt from
                  // scratch every time a new client is onboarded (see taskService.js's
                  // generateSEOTasks), so completed_tasks only reflects the current
                  // rotation cycle, not the associate's real history. lifetime_completed_links
                  // is a running total from the sheet that's never reset — use that for the
                  // overall progress percentage instead (same number shown in All-Time (Sheet)).
                  const progressPercent = expectedTotalLinks > 0 ? Math.round(((associate.lifetime_completed_links || 0) / expectedTotalLinks) * 100) : 0;
                  return (
                    <tr key={associate.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem 1rem 0.75rem 0', fontWeight: '500', whiteSpace: 'nowrap' }}>{associate.name}</td>
                      <td style={{ padding: '0.75rem 1rem 0.75rem 0', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{associate.email}</td>
                      <td style={{ padding: '0.75rem 1rem 0.75rem 0', whiteSpace: 'nowrap' }}>
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: associate.is_active ? 'rgba(34, 197, 94, 0.1)' : 'rgba(156, 163, 175, 0.1)',
                          color: associate.is_active ? 'var(--success)' : 'var(--text-muted)',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: '500'
                        }}>
                          {associate.is_active ? 'active' : 'inactive'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem 0.75rem 0', fontWeight: '600', color: 'var(--primary)', whiteSpace: 'nowrap' }}>{associate.total_clients}</td>
                      <td style={{ padding: '0.75rem 1rem 0.75rem 0', fontWeight: '600', color: 'var(--success)', whiteSpace: 'nowrap' }}>{monthlyTargetPerClient}</td>
                      <td style={{ padding: '0.75rem 1rem 0.75rem 0', fontWeight: '600', color: 'var(--primary)', whiteSpace: 'nowrap' }}>{expectedTotalLinks}</td>
                      <td style={{ padding: '0.75rem 1rem 0.75rem 0', whiteSpace: 'nowrap' }}>{associate.completed_tasks || 0}</td>
                      <td style={{ padding: '0.75rem 1rem 0.75rem 0', fontWeight: '600', color: 'var(--success)', whiteSpace: 'nowrap' }}>{associate.lifetime_completed_links || 0}</td>
                      <td style={{ padding: '0.75rem 1rem 0.75rem 0', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: '80px', height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: `${progressPercent}%`, height: '100%', backgroundColor: 'var(--primary)' }}></div>
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{progressPercent}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 0' }}>
                        <Link href={`/admin/seo-associates/${associate.id}`} style={{
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
                          View Dashboard
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
    </div>
  );
}
