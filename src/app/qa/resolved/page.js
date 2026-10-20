import QaReportsPage from '../reports/page';

export const revalidate = 0;

// Only the issues managers have resolved — the same cards as Reports.
export default function QaResolvedPage() {
  return <QaReportsPage onlyResolved />;
}
