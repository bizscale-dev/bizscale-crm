import WebSeoAssociatesProgress from '@/components/team-progress/WebSeoAssociatesProgress';

export const revalidate = 0;

export default function WebSeoManagerPage({ searchParams }) {
  return <WebSeoAssociatesProgress basePath="/web-seo-manager" searchParams={searchParams} />;
}
