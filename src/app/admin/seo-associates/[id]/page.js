import SeoAssociateDetail from '@/components/team-progress/SeoAssociateDetail';

export const revalidate = 0; // Disable caching for real-time data

export default async function SEOAssociateDashboard({ params, searchParams }) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  return (
    <SeoAssociateDetail
      id={id}
      backHref="/admin/seo-associates"
      backLabel="SEO Associates"
      showFunnelLink
      basePath={`/admin/seo-associates/${id}`}
      selectedDate={resolvedSearchParams?.date}
    />
  );
}
