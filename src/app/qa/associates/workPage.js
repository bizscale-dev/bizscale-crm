import { getDb } from '@/lib/db';
import { loadAssociateWork, pakistanDate, isIsoDate } from '@/lib/qaAssociateWork';
import AssociateWorkView from './AssociateWorkView';

// Shared by the QA SEO Associates and Web SEO Associates pages: one card per associate with the
// links they completed on the chosen day (default: yesterday), grouped by client and link type,
// with a Report button on each card.
export async function renderAssociateWorkPage(kind, searchParams) {
  const sp = (await searchParams) || {};
  const today = pakistanDate(0);
  const date = isIsoDate(sp.date) && sp.date <= today ? sp.date : pakistanDate(-1);
  const db = await getDb();
  const associates = await loadAssociateWork(db, kind, date);
  const title = kind === 'web' ? 'Web SEO Associates' : 'SEO Associates';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.35rem' }}>{title}</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          What each associate completed on {date}{date === pakistanDate(-1) ? ' (yesterday)' : ''}, by client and link type with the links. Check it, then use Report on the associate&apos;s card —
          it goes to the manager who owns that client.
        </p>
      </div>
      <AssociateWorkView associates={associates} date={date} today={today} />
    </div>
  );
}
