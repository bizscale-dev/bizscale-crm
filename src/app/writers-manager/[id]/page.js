import WriterDetail from '@/components/team-progress/WriterDetail';

export const revalidate = 0;

export default async function WritersManagerDetail({ params }) {
  const { id } = await params;
  return <WriterDetail id={id} backHref="/writers-manager" backLabel="Writers" />;
}
