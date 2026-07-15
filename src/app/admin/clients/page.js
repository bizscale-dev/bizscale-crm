import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import ClientForm from './ClientForm';
import ClientList from './ClientList';
import BulkImport from './BulkImport';
import GoogleSheetImport from './GoogleSheetImport';

export default async function ClientsPage() {
  const db = await getDb();
  const campaign = await getActiveCampaign();
  
  let clients = [];
  let associates = [];

  if (campaign) {
    // Fetch clients with their assigned associates AND writers from database
    clients = (await db.prepare(`
      SELECT c.*,
        u_assoc.name as assigned_associate,
        u_writer.name as assigned_writer
      FROM clients c
      LEFT JOIN users u_assoc ON u_assoc.id = c.assigned_associate_id
      LEFT JOIN users u_writer ON u_writer.id = c.assigned_writer_id
      WHERE c.campaign_id = ?
      ORDER BY c.sort_order, c.id
    `).all(campaign.id)).map(c => ({ ...c }));

    console.log('[clients-page] Loaded clients with writers:', clients.filter(c => c.assigned_writer).length, 'have writers assigned');

    associates = (await db.prepare(`
      SELECT DISTINCT u.id, u.name
      FROM users u
      WHERE u.role IN ('seo_associate', 'associate') AND u.is_active = 1
      AND u.id IN (SELECT DISTINCT assigned_associate_id FROM clients WHERE campaign_id = ?)
      ORDER BY u.name
    `).all(campaign.id)).map(a => ({ ...a }));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {!campaign ? (
        <div className="card">
          <p style={{ color: 'var(--danger)', margin: 0 }}>
            No active campaign found. You must activate a campaign before managing clients.
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <div className="card">
              <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                Add New Client
              </h2>
              <ClientForm mode="create" />
            </div>

            <div className="card">
              <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                Bulk Import
              </h2>
              <BulkImport />
            </div>
          </div>

          <div className="card">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              Import from Google Sheets
            </h2>
            <GoogleSheetImport />
          </div>

          <div className="card">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              Manage Clients
            </h2>
            <ClientList clients={clients} associates={associates} />
          </div>
        </>
      )}

    </div>
  );
}
