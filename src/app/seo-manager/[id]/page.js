import { getDb } from '@/lib/db';
import SeoAssociateDetail from '@/components/team-progress/SeoAssociateDetail';

export const revalidate = 0;

export default async function SeoManagerAssociateDetail({ params, searchParams }) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const wanted = resolvedSearchParams?.campaign;
  const db = await getDb();
  // Same fallback as the list: chosen campaign, else active, else latest.
  const campaign = (wanted && await db.prepare('SELECT * FROM campaigns WHERE id = ?').get(wanted))
    || await db.prepare("SELECT * FROM campaigns ORDER BY (status = 'active') DESC, id DESC LIMIT 1").get()
    || null;
  return (
    <SeoAssociateDetail
      id={id}
      campaign={campaign || undefined}
      backHref="/seo-manager"
      backLabel="SEO Associates"
      basePath={`/seo-manager/${id}${wanted ? `?campaign=${campaign?.id}` : ''}`}
      selectedDate={resolvedSearchParams?.date}
    />
  );
}
