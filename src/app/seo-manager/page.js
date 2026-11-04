import SeoAssociatesTable from '@/components/team-progress/SeoAssociatesTable';

export const revalidate = 0;

export default function SeoManagerPage({ searchParams }) {
  return <SeoAssociatesTable basePath="/seo-manager" searchParams={searchParams} />;
}
