import { getDb } from '@/lib/db';
import { getActiveWebSeoCampaign } from '@/lib/services';
import { listOffDays } from '@/lib/webSeoCampaignOffDays';
import WebClientList from './WebClientList';
import WebClientImport from './WebClientImport';
import WebSeoCampaignPanel from './WebSeoCampaignPanel';
import WebSeoCampaignHistoryList from './WebSeoCampaignHistoryList';
import UnmatchedAssociateNames from './UnmatchedAssociateNames';

export const revalidate = 0;

export default async function WebClientsPage() {
  const db = await getDb();
  const campaign = await getActiveWebSeoCampaign();
  const allCampaigns = await db.prepare('SELECT * FROM webseo_campaigns ORDER BY id DESC').all();

  let webClients = [];
  let webAssociates = [];
  let offDays = [];
  let unmatchedNames = [];

  if (campaign) {
    // Fetch web clients with their assigned associates
    webClients = (await db.prepare(`
      SELECT wc.*,
        u.name as assigned_associate_name
      FROM web_clients wc
      LEFT JOIN users u ON u.id = wc.assigned_associate_id
      WHERE wc.webseo_campaign_id = ?
      ORDER BY wc.id
    `).all(campaign.id)).map(c => ({ ...c }));

    // Get all active Web SEO Associates
    webAssociates = await db.prepare(`
      SELECT id, name
      FROM users
      WHERE role = 'web_seo_associate' AND is_active = 1
      ORDER BY name
    `).all();

    offDays = await listOffDays(campaign.id);

    // Associate names read straight from the sheet that didn't match any real
    // web_seo_associate by name (and have no saved mapping either — see
    // web_associate_name_mappings) — an admin maps each one below, once, and
    // every future import applies it automatically.
    unmatchedNames = (await db.prepare(`
      SELECT sheet_associate_name as name, COUNT(*) as client_count
      FROM web_clients
      WHERE webseo_campaign_id = ? AND is_active = 1
        AND assigned_associate_id IS NULL AND sheet_associate_name IS NOT NULL AND sheet_associate_name != ''
      GROUP BY sheet_associate_name
      ORDER BY sheet_associate_name
    `).all(campaign.id));
  }

  const BRAND_COLOR = '#16b293';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', margin: 0, marginBottom: '0.5rem' }}>Web Clients</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          Import and manage web clients with assigned Web SEO Associates
        </p>
      </div>

      {/* Web SEO Campaign — independent of the SEO campaign, its own dates/duration */}
      <WebSeoCampaignPanel campaign={campaign} offDays={offDays} />

      <WebSeoCampaignHistoryList campaigns={allCampaigns} activeCampaignId={campaign?.id} />

      {!campaign ? null : (
        <>
          {/* Import Section */}
          <div className="card">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              Import Web Clients from Google Sheets
            </h2>
            <WebClientImport />
          </div>

          {/* Sheet associate names that didn't match a real associate — map them
              once and it's remembered for every future import. */}
          <UnmatchedAssociateNames unmatchedNames={unmatchedNames} webAssociates={webAssociates} />

          {/* Stats Overview */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <div className="card" style={{ borderLeft: `4px solid ${BRAND_COLOR}` }}>
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Active Web Clients
              </h3>
              <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>
                {webClients.filter(c => c.is_active).length}
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
                {webClients.filter(c => c.is_active && c.assigned_associate_id).length}
              </div>
            </div>
            <div className="card" style={{ borderLeft: '4px solid var(--text-muted)' }}>
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                Removed (from sheet)
              </h3>
              <div style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--foreground)' }}>
                {webClients.filter(c => !c.is_active).length}
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
