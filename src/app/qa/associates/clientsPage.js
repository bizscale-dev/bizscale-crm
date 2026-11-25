import { getDb } from '@/lib/db';
import { loadClientLinks } from '@/lib/qaClientLinks';
import ClientLinksView from './ClientLinksView';

// Shared by the QA SEO Clients and Web Clients pages: every client with all its links.
export async function renderClientLinksPage(kind) {
  const db = await getDb();
  const { campaigns, clients } = await loadClientLinks(db, kind);
  const title = kind === 'web' ? 'Web SEO Clients' : 'SEO Clients';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.35rem' }}>{title}</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          Every client with all of its links. Mark a link Pass or Fail, or Report it. The mark is the same one shown on the
          {kind === 'web' ? ' Web SEO Associates' : ' SEO Associates'} page, so checking a link in either place updates the other.
        </p>
      </div>
      <ClientLinksView kind={kind} clients={clients} campaigns={campaigns} />
    </div>
  );
}
