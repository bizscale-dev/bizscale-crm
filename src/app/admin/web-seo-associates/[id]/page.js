import WebSeoAssociateDetail from '@/components/team-progress/WebSeoAssociateDetail';

export const revalidate = 0;

export default async function WebSeoAssociateDashboard({ params }) {
  const { id } = await params;
  return <WebSeoAssociateDetail id={id} backHref="/admin/web-seo-associates" backLabel="Web SEO Associates" />;
}
