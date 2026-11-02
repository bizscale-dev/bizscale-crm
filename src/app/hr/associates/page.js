import { getDb } from '@/lib/db';
import { getSeoAssociateCards, getWebSeoAssociateCards } from '@/lib/associateStats';
import StatCard from '@/components/ui/StatCard';
import Badge from '@/components/ui/Badge';
import { cardStyle } from '../hrStyles';
import CampaignPicker from './CampaignPicker';

export const revalidate = 0;

function AssociateCard({ associate, stats }) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div>
          <h3 style={{ fontSize: '1.15rem', margin: 0 }}>{associate.name}</h3>
          <p style={{ color: 'var(--text-muted)', margin: '0.2rem 0 0', fontSize: '0.8rem' }}>{associate.email}</p>
        </div>
        <Badge tone="success">active</Badge>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem' }}>
        <StatCard title="On Time Completion" value={stats.onTime} sub={`${stats.onTimePercent}% done on the day it was assigned`} color="#16b293" />
        <StatCard title="Today's Target" value={stats.todayTarget} sub={`${stats.todayCompleted} completed (${stats.todayPercent}%)`} color="var(--primary)" />
        <StatCard title="Overall Target" value={stats.overallTarget} sub={`${stats.overallCompleted} completed (${stats.overallPercent}%)`} color="var(--success)" />
        <StatCard title="Percentage Completion" value={`${stats.overallPercent}%`} sub={`${stats.overallCompleted} / ${stats.overallTarget} tasks`} color="var(--success)" />
        <StatCard title="Upcoming Days" value={stats.upcomingDays} sub="remaining days with tasks" color="#f59e0b" />
        <StatCard title="Pending Tasks" value={stats.pending} sub="overdue, not yet completed" color="#f59e0b" />
      </div>
    </div>
  );
}

function Section({ title, count, note, children }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h2 style={{ fontSize: '1.15rem', margin: 0 }}>
        {title} <span style={{ color: 'var(--text-muted)', fontWeight: '400', fontSize: '0.9rem' }}>({count})</span>
      </h2>
      {note && <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.8rem' }}>{note}</p>}
      {children}
    </section>
  );
}

// The chosen campaign (?param=id), else the active one, else the latest.
function pickCampaign(all, wantedId) {
  return all.find((c) => String(c.id) === String(wantedId))
    || all.find((c) => c.status === 'active')
    || all[0]
    || null;
}

export default async function HrAssociatesPage({ searchParams }) {
  const sp = (await searchParams) || {};
  const db = await getDb();
  const seoAll = await db.prepare('SELECT * FROM campaigns ORDER BY id DESC').all();
  const webAll = await db.prepare('SELECT * FROM webseo_campaigns ORDER BY id DESC').all();
  const seoCampaign = pickCampaign(seoAll, sp.seo);
  const webCampaign = pickCampaign(webAll, sp.web);

  const seoAssociates = await db.prepare(
    "SELECT id, name, email FROM users WHERE role = 'seo_associate' AND is_active = 1 ORDER BY name"
  ).all();
  const webAssociates = await db.prepare(
    "SELECT id, name, email FROM users WHERE role = 'web_seo_associate' AND is_active = 1 ORDER BY name"
  ).all();

  const seo = seoCampaign
    ? await Promise.all(seoAssociates.map(async (a) => ({ associate: a, stats: await getSeoAssociateCards(db, seoCampaign, a.id) })))
    : [];
  const web = webCampaign
    ? await Promise.all(webAssociates.map(async (a) => ({ associate: a, stats: await getWebSeoAssociateCards(db, webCampaign, a.id) })))
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.35rem' }}>Associates</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          How every associate is doing on their link targets, in the active campaign, or any past one you pick.
        </p>
      </div>

      <Section title="SEO Associates" count={seoAssociates.length} note={seoCampaign && seoCampaign.status !== 'active' ? `Showing ${seoCampaign.name} (${seoCampaign.status}).` : null}>
        {seoCampaign && <CampaignPicker param="seo" campaigns={seoAll} selectedId={seoCampaign.id} />}
        {!seoCampaign ? (
          <div style={cardStyle}><p style={{ color: 'var(--text-muted)', margin: 0 }}>No SEO campaigns yet.</p></div>
        ) : seo.map(({ associate, stats }) => <AssociateCard key={associate.id} associate={associate} stats={stats} />)}
      </Section>

      <Section title="Web SEO Associates" count={webAssociates.length} note={webCampaign && webCampaign.status !== 'active' ? `Showing ${webCampaign.name} (${webCampaign.status}).` : null}>
        {webCampaign && <CampaignPicker param="web" campaigns={webAll} selectedId={webCampaign.id} />}
        {!webCampaign ? (
          <div style={cardStyle}><p style={{ color: 'var(--text-muted)', margin: 0 }}>No Web SEO campaigns yet.</p></div>
        ) : web.map(({ associate, stats }) => <AssociateCard key={associate.id} associate={associate} stats={stats} />)}
      </Section>
    </div>
  );
}
