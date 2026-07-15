import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import CampaignForm from './CampaignForm';
import CampaignList from './CampaignList';

const BRAND_COLOR = '#16b293';

export default async function CampaignPage() {
  const db = await getDb();
  const campaigns = (await db.prepare('SELECT * FROM campaigns ORDER BY id DESC').all()).map(c => ({ ...c }));
  const activeCampaign = await getActiveCampaign();

  const activeCount = campaigns.filter(c => c.status === 'active').length;
  const pausedCount = campaigns.filter(c => c.status === 'paused').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', margin: 0, marginBottom: '0.5rem' }}>Campaigns</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          Create and manage campaign cycles — link targets, rotation settings, and content quotas all live here.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
        <StatCard title="Total Campaigns" value={campaigns.length} color={BRAND_COLOR} />
        <StatCard title="Active" value={activeCount} color="var(--success)" />
        <StatCard title="Paused" value={pausedCount} color="#f59e0b" />
        <StatCard
          title="Currently Running"
          value={activeCampaign?.name || 'None'}
          sub={activeCampaign ? `${activeCampaign.total_days} day cycle` : 'No active campaign'}
          color="var(--primary)"
        />
      </div>

      {/* Create New Campaign */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '2rem', height: '2rem', borderRadius: '0.5rem',
            backgroundColor: 'rgba(22, 178, 147, 0.1)', color: BRAND_COLOR, fontSize: '1.1rem', fontWeight: 'bold'
          }}>+</span>
          <div>
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Create New Campaign</h2>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Set rotation, link targets, and content quotas for a new cycle</p>
          </div>
        </div>

        <CampaignForm mode="create" />
      </div>

      {/* Existing Campaigns */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>All Campaigns</h2>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{campaigns.length} total</span>
        </div>

        <CampaignList campaigns={campaigns} activeCampaignId={activeCampaign?.id} />
      </div>
    </div>
  );
}

function StatCard({ title, value, sub, color }) {
  return (
    <div className="card" style={{ borderLeft: `4px solid ${color}` }}>
      <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>{title}</h3>
      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  );
}
