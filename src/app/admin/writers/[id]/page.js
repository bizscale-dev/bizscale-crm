import WriterDetail from '@/components/team-progress/WriterDetail';

export const revalidate = 0; // Disable caching for real-time data

export default async function WriterDashboard({ params }) {
  const { id } = await params;
  return <WriterDetail id={id} backHref="/admin/writers" backLabel="Writers" />;
}
