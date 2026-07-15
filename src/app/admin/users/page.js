import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import UserForm from './UserForm';
import UserList from './UserList';
import ImportAssociatesForm from '@/components/ImportAssociatesForm';
import { importAssociatesFromSheet } from './actions';

export default async function UsersPage() {
  const db = await getDb();
  const users = (await db.prepare("SELECT * FROM users ORDER BY role, name").all()).map(u => ({ ...u }));
  const campaign = await getActiveCampaign();
  
  let assignedAssociates = [];
  let assignedWriters = [];

  if (campaign) {
    assignedAssociates = (await db.prepare('SELECT user_id FROM associate_assignments WHERE campaign_id = ?').all(campaign.id)).map(r => r.user_id);
    assignedWriters = (await db.prepare('SELECT user_id FROM writer_assignments WHERE campaign_id = ?').all(campaign.id)).map(r => r.user_id);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="card">
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          Create New User
        </h2>
        <UserForm mode="create" />
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          Import SEO Associates from Google Sheets
        </h2>
        <ImportAssociatesForm importAction={importAssociatesFromSheet} />
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          Manage Users
        </h2>
        <UserList 
          users={users} 
          assignedAssociates={assignedAssociates} 
          assignedWriters={assignedWriters} 
          hasActiveCampaign={!!campaign} 
        />
      </div>
    </div>
  );
}
