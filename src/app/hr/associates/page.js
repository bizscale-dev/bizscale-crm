import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import { getActiveWebSeoCampaign } from '@/lib/services';
import { getSeoAssociateCards, getWebSeoAssociateCards } from '@/lib/associateStats';
import StatCard from '@/components/ui/StatCard';
import Badge from '@/components/ui/Badge';
import { cardStyle } from '../hrStyles';

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

export default async function HrAssociatesPage() {
  const db = await getDb();
  const seoCampaign = await getActiveCampaign();
  // Web SEO campaigns are separate and can end before the next one starts — fall back
  // to the latest one so these associates' numbers don't vanish in between.
  const webCampaign = (await getActiveWebSeoCampaign())
    || (await db.prepare('SELECT * FROM webseo_campaigns ORDER BY id DESC LIMIT 1').get())
    || null;

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
          How every associate is doing on their link targets, in the active campaign.
        </p>
      </div>

      <Section title="SEO Associates" count={seoAssociates.length}>
        {!seoCampaign ? (
          <div style={cardStyle}><p style={{ color: 'var(--text-muted)', margin: 0 }}>No active SEO campaign.</p></div>
        ) : seo.map(({ associate, stats }) => <AssociateCard key={associate.id} associate={associate} stats={stats} />)}
      </Section>

      <Section title="Web SEO Associates" count={webAssociates.length} note={webCampaign && webCampaign.status !== 'active' ? `Showing the latest campaign (${webCampaign.name}, ${webCampaign.status}) — no Web SEO campaign is active right now.` : null}>
        {!webCampaign ? (
          <div style={cardStyle}><p style={{ color: 'var(--text-muted)', margin: 0 }}>No active Web SEO campaign.</p></div>
        ) : web.map(({ associate, stats }) => <AssociateCard key={associate.id} associate={associate} stats={stats} />)}
      </Section>
    </div>
  );
}
