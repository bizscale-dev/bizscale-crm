import WebSeoAssociateDetail from '@/components/team-progress/WebSeoAssociateDetail';

export const revalidate = 0;

export default async function WebSeoAssociateDashboard({ params, searchParams }) {
  const { id } = await params;
  const sp = (await searchParams) || {};
  return <WebSeoAssociateDetail id={id} backHref="/admin/web-seo-associates" backLabel="Web SEO Associates" basePath={`/admin/web-seo-associates/${id}`} selectedDate={sp.date} />;
}
