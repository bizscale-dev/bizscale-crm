import SeoAssociatesTable from '@/components/team-progress/SeoAssociatesTable';

export default function SEOAssociatesPage({ searchParams }) {
  return <SeoAssociatesTable basePath="/admin/seo-associates" searchParams={searchParams} />;
}
