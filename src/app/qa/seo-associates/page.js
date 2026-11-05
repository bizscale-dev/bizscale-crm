import { renderAssociateWorkPage } from '../associates/workPage';

export const revalidate = 0;

export default function QaSeoAssociatesPage({ searchParams }) {
  return renderAssociateWorkPage('seo', searchParams);
}
