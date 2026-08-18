import { getDb } from '@/lib/db';
import Link from 'next/link';
import { getActiveCampaign, getTotalLinksPerClient } from '@/lib/services';
import { LINK_TYPES } from '@/lib/linkTargetConstants';
import { FUNNEL_BONUS_FIELDS } from '@/lib/funnelConstants';

/**
 * The full SEO Associates listing table — Funnel Clients/Tasks breakdown, Total
 * Expected Links (including funnel bonus), All-Time (Sheet), progress. Shared by
 * the admin's own page (src/app/admin/seo-associates/page.js) and the SEO
 * Manager's equivalent (src/app/seo-manager/page.js) so both roles see the exact
 * same view — basePath controls where "View Dashboard" links to.
 */
export default async function SeoAssociatesTable({ basePath }) {
  const db = await getDb();

  // Monthly target per client comes from the active campaign's configured link
  // targets (web2 + guestpost + pdf + profile + citation + image), not a fixed number.
  const campaign = await getActiveCampaign();
  const monthlyTargetPerClient = campaign ? getTotalLinksPerClient(campaign) : 0;

  // A funnel Month 2/3 client's target is the campaign's Month 2 & 3 Bonus Link
  // Targets (Admin → Funnel) instead of the normal monthlyTargetPerClient — see
  // taskService.js's generateSEOTasks, which now includes these clients directly.
  const funnelBonusTargetPerClient = campaign
    ? LINK_TYPES.reduce((sum, type) => sum + (campaign[FUNNEL_BONUS_FIELDS[type]] || 0), 0)
    : 0;

  // Get all SEO associates with client and task information — scoped to the active
  // campaign only (a client/task from a past campaign shouldn't count here).
  // "total_clients" excludes ALL funnel-active clients (month 1, 2, or 3) — the
  // funnel_m1/m2/m3 counts below cover those separately.
  const associates = campaign ? await db.prepare(`
    SELECT u.id, u.name, u.email, u.is_active, u.lifetime_completed_links,
      (SELECT COUNT(*) FROM seo_tasks WHERE associate_id = u.id AND campaign_id = ?) as total_tasks,
      (SELECT SUM(completed_count) FROM seo_tasks WHERE associate_id = u.id AND campaign_id = ?) as completed_tasks,
      (SELECT COUNT(*) FROM clients WHERE assigned_associate_id = u.id AND campaign_id = ?
         AND (tunnel_status IS NULL OR tunnel_status != 'active')) as total_clients,
      (SELECT COUNT(*) FROM clients WHERE assigned_associate_id = u.id AND campaign_id = ?
         AND tunnel_status = 'active' AND funnel_month = 1) as funnel_m1,
      (SELECT COUNT(*) FROM clients WHERE assigned_associate_id = u.id AND campaign_id = ?
         AND tunnel_status = 'active' AND funnel_month = 2) as funnel_m2,
      (SELECT COUNT(*) FROM clients WHERE assigned_associate_id = u.id AND campaign_id = ?
         AND tunnel_status = 'active' AND funnel_month = 3) as funnel_m3
    FROM users u
    WHERE u.role IN ('seo_associate', 'associate')
    ORDER BY u.name ASC
  `).all(campaign.id, campaign.id, campaign.id, campaign.id, campaign.id, campaign.id) : [];

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
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th rowSpan={2} style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>Name</th>
                  <th rowSpan={2} style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>Email</th>
                  <th rowSpan={2} style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>Status</th>
                  <th rowSpan={2} style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>Total Clients</th>
                  <th rowSpan={2} style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>Total Tasks Per Client</th>
                  <th colSpan={3} style={{ padding: '0.4rem 1rem 0.4rem 0', textAlign: 'center', textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: '600', borderBottom: '1px solid var(--border)' }}>Funnel Clients</th>
                  <th colSpan={2} style={{ padding: '0.4rem 1rem 0.4rem 0', textAlign: 'center', textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: '600', borderBottom: '1px solid var(--border)' }}>Funnel Tasks</th>
                  <th rowSpan={2} style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>Total Expected Links</th>
                  <th rowSpan={2} style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>Completed</th>
                  <th rowSpan={2} style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>All-Time (Sheet)</th>
                  <th rowSpan={2} style={{ padding: '0.75rem 1rem 0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>Progress</th>
                  <th rowSpan={2} style={{ padding: '0.75rem 0', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>Action</th>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.4rem 0.5rem 0.75rem 0', textAlign: 'center', fontSize: '0.7rem', fontWeight: '600' }}>M1</th>
                  <th style={{ padding: '0.4rem 0.5rem 0.75rem 0', textAlign: 'center', fontSize: '0.7rem', fontWeight: '600' }}>M2</th>
                  <th style={{ padding: '0.4rem 1rem 0.75rem 0', textAlign: 'center', fontSize: '0.7rem', fontWeight: '600' }}>M3</th>
                  <th style={{ padding: '0.4rem 0.5rem 0.75rem 0', textAlign: 'center', fontSize: '0.7rem', fontWeight: '600' }}>M2</th>
                  <th style={{ padding: '0.4rem 1rem 0.75rem 0', textAlign: 'center', fontSize: '0.7rem', fontWeight: '600' }}>M3</th>
                </tr>
              </thead>
              <tbody>
                {associates.map((associate) => {
                  // Total Expected Links = normal clients' target + this associate's
                  // Month 2/3 funnel clients' bonus-target totals (Month 1 excluded —
                  // it's a fixed platform checklist, not "links").
                  const funnelM2Expected = associate.funnel_m2 * funnelBonusTargetPerClient;
                  const funnelM3Expected = associate.funnel_m3 * funnelBonusTargetPerClient;
                  const expectedTotalLinks = (associate.total_clients * monthlyTargetPerClient) + funnelM2Expected + funnelM3Expected;
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
                      <td style={{ padding: '0.75rem 0.5rem 0.75rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>{associate.funnel_m1 || 0}</td>
                      <td style={{ padding: '0.75rem 0.5rem 0.75rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>{associate.funnel_m2 || 0}</td>
                      <td style={{ padding: '0.75rem 1rem 0.75rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>{associate.funnel_m3 || 0}</td>
                      <td style={{ padding: '0.75rem 0.5rem 0.75rem 0', textAlign: 'center', color: 'var(--primary)', fontWeight: '600' }}>{funnelM2Expected || 0}</td>
                      <td style={{ padding: '0.75rem 1rem 0.75rem 0', textAlign: 'center', color: 'var(--primary)', fontWeight: '600' }}>{funnelM3Expected || 0}</td>
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
                        <Link href={`${basePath}/${associate.id}`} style={{
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
