import SeoAssociateDetail from '@/components/team-progress/SeoAssociateDetail';

export const revalidate = 0;

export default async function SeoManagerAssociateDetail({ params }) {
  const { id } = await params;
  return <SeoAssociateDetail id={id} backHref="/seo-manager" backLabel="SEO Associates" />;
}
