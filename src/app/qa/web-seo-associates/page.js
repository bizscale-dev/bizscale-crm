import { renderAssociateWorkPage } from '../associates/workPage';

export const revalidate = 0;

export default function QaWebSeoAssociatesPage({ searchParams }) {
  return renderAssociateWorkPage('web', searchParams);
}
