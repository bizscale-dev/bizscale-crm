import WebSeoAssociateDetail from '@/components/team-progress/WebSeoAssociateDetail';

export const revalidate = 0;

export default async function WebSeoManagerDetail({ params }) {
  const { id } = await params;
  return <WebSeoAssociateDetail id={id} backHref="/web-seo-manager" backLabel="Web SEO Associates" />;
}
