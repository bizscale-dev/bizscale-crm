import { getDb } from '@/lib/db';
import WebSeoAssociateDetail from '@/components/team-progress/WebSeoAssociateDetail';

export const revalidate = 0;

export default async function WebSeoManagerDetail({ params, searchParams }) {
  const { id } = await params;
  const sp = (await searchParams) || {};
  const wanted = sp.campaign;
  const db = await getDb();
  // Same fallback as the list: chosen campaign, else active, else latest.
  const campaign = (wanted && await db.prepare('SELECT * FROM webseo_campaigns WHERE id = ?').get(wanted))
    || await db.prepare("SELECT * FROM webseo_campaigns ORDER BY (status = 'active') DESC, id DESC LIMIT 1").get()
    || null;
  return (
    <WebSeoAssociateDetail
      id={id}
      campaign={campaign || undefined}
      backHref="/web-seo-manager"
      backLabel="Web SEO Associates"
      basePath={`/web-seo-manager/${id}${wanted && campaign ? `?campaign=${campaign.id}` : ''}`}
      selectedDate={sp.date}
    />
  );
}
