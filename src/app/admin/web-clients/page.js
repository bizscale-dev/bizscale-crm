import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import WebClientList from './WebClientList';
import WebClientImport from './WebClientImport';

export const revalidate = 0;

export default async function WebClientsPage() {
  const db = await getDb();
  const campaign = await getActiveCampaign();

  let webClients = [];
  let webAssociates = [];

  if (campaign) {
    // Fetch web clients with their assigned associates
    webClients = (await db.prepare(`
      SELECT wc.*,
        u.name as assigned_associate_name
      FROM web_clients wc
      LEFT JOIN users u ON u.id = wc.assigned_associate_id
      WHERE wc.campaign_id = ?
      ORDER BY wc.id
    `).all(campaign.id)).map(c => ({ ...c }));

    // Get all active Web SEO Associates
    webAssociates = await db.prepare(`
      SELECT id, name
      FROM users
      WHERE role = 'web_seo_associate' AND is_active = 1
      ORDER BY name
    `).all();
  }

  const BRAND_COLOR = '#16b293';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {!campaign ? (
        <div className="card">
          <h3>No Active Campaign</h3>
          <p style={{ color: 'var(--text-muted)' }}>Please activate a campaign to manage Web Clients.</p>
        </div>
      ) : (
        <>
          <div>
            <h1 style={{ fontSize: '1.75rem', margin: 0, marginBottom: '0.5rem' }}>Web Clients</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
              Import and manage web clients with assigned Web SEO Associates
            </p>
          </div>

          {/* Import Section */}
          <div className="card">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              Import Web Clients from Google Sheets
            </h2>
            <WebClientImport />
          </div>

          {/* Stats Overview */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <div className="card" style={{ borderLeft: `4px solid ${BRAND_COLOR}` }}>
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Total Web Clients
              </h3>
              <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>
                {webClients.length}
              </div>
            </div>
            <div className="card" style={{ borderLeft: `4px solid ${BRAND_COLOR}` }}>
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Web SEO Associates
              </h3>
              <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>
                {webAssociates.length}
              </div>
            </div>
            <div className="card" style={{ borderLeft: `4px solid ${BRAND_COLOR}` }}>
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Assigned
              </h3>
              <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>
                {webClients.filter(c => c.assigned_associate_id).length}
              </div>
            </div>
          </div>

          {/* Web Clients List */}
          <div className="card">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              Manage Web Clients
            </h2>
            <WebClientList webClients={webClients} webAssociates={webAssociates} campaign={campaign} />
          </div>
        </>
      )}
    </div>
  );
}
