import SeoAssociateDetail from '@/components/team-progress/SeoAssociateDetail';

export const revalidate = 0; // Disable caching for real-time data

export default async function SEOAssociateDashboard({ params }) {
  const { id } = await params;
  return <SeoAssociateDetail id={id} backHref="/admin/seo-associates" backLabel="SEO Associates" showFunnelLink />;
}
