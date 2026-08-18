import SeoAssociateDetail from '@/components/team-progress/SeoAssociateDetail';

export const revalidate = 0;

export default async function SeoManagerAssociateDetail({ params, searchParams }) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  return (
    <SeoAssociateDetail
      id={id}
      backHref="/seo-manager"
      backLabel="SEO Associates"
      basePath={`/seo-manager/${id}`}
      selectedDate={resolvedSearchParams?.date}
    />
  );
}
