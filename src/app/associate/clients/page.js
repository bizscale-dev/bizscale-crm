import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import { verifySession } from '@/lib/session';
import GoogleSheetImportForm from '@/components/GoogleSheetImportForm';
import { importClientsFromGoogleSheet } from '../actions';

export const revalidate = 0; // Disable caching for real-time data

export default async function AssociateClientsPage() {
  const session = await verifySession();
  const db = await getDb();
  const campaign = await getActiveCampaign();

  if (!campaign) {
    return (
      <div className="card">
        <p style={{ color: 'var(--danger)', margin: 0 }}>No active campaign found.</p>
      </div>
    );
  }

  const assignment = await db
    .prepare('SELECT * FROM associate_assignments WHERE campaign_id = ? AND user_id = ?')
    .get(campaign.id, session.userId);

  if (!assignment) {
    return (
      <div className="card">
        <p style={{ color: 'var(--danger)', margin: 0 }}>
          You are not assigned to the active campaign. Contact your admin.
        </p>
      </div>
    );
  }

  // Only show active clients
  const clients = await db
    .prepare(`
      SELECT * FROM clients
      WHERE campaign_id = ?
        AND sort_order >= ?
        AND sort_order <= ?
        AND is_active = 1
      ORDER BY sort_order, id
    `)
    .all(campaign.id, assignment.client_group_start, assignment.client_group_end);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="card">
        <h2
          style={{
            fontSize: '1.25rem',
            marginBottom: '1.5rem',
            borderBottom: '1px solid var(--border)',
            paddingBottom: '1rem',
          }}
        >
          Import from Google Sheets
        </h2>
        <GoogleSheetImportForm importAction={importClientsFromGoogleSheet} />
      </div>

      <div className="card">
        <h2
          style={{
            fontSize: '1.25rem',
            marginBottom: '1.5rem',
            borderBottom: '1px solid var(--border)',
            paddingBottom: '1rem',
          }}
        >
          My Clients ({assignment.client_group_start}–{assignment.client_group_end})
        </h2>

        {clients.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            No active clients in your assigned range yet. Import from a Google Sheet above.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.75rem 0' }}>#</th>
                  <th style={{ padding: '0.75rem 0' }}>Client</th>
                  <th style={{ padding: '0.75rem 0' }}>Website</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem 0', color: 'var(--text-muted)' }}>{c.sort_order}</td>
                    <td style={{ padding: '0.75rem 0', fontWeight: '500' }}>{c.name}</td>
                    <td style={{ padding: '0.75rem 0' }}>
                      {c.website ? (
                        <a
                          href={c.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--primary)', textDecoration: 'none' }}
                        >
                          {c.website}
                        </a>
                      ) : (
                        '—'
                      )}
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
