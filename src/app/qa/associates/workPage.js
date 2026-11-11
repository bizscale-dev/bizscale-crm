import { getDb } from '@/lib/db';
import { loadAssociateWork, pakistanDate, isIsoDate } from '@/lib/qaAssociateWork';
import AssociateWorkView from './AssociateWorkView';

// Shared by the QA SEO Associates and Web SEO Associates pages: one card per associate with the
// links they completed on the chosen day (default: yesterday), grouped by client and link type,
// with a Report button on each card.
export async function renderAssociateWorkPage(kind, searchParams) {
  const sp = (await searchParams) || {};
  const today = pakistanDate(0);
  const db = await getDb();
  // Default: the last working day before today that has completed links (yesterday is a weekend
  // on Mondays, when nothing is worked).
  let date = isIsoDate(sp.date) && sp.date <= today ? sp.date : null;
  if (!date) {
    const last = await db.prepare(
      kind === 'web'
        ? 'SELECT MAX(task_date) AS d FROM webseo_tasks WHERE completed_count > 0 AND task_date < ?'
        : 'SELECT MAX(task_date) AS d FROM seo_tasks WHERE completed_count > 0 AND task_date < ?'
    ).get(today);
    date = last?.d || pakistanDate(-1);
  }
  const associates = await loadAssociateWork(db, kind, date);
  const title = kind === 'web' ? 'Web SEO Associates' : 'SEO Associates';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.35rem' }}>{title}</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          What each associate completed on {date}{date === pakistanDate(-1) ? ' (yesterday)' : date === today ? ' (today)' : ''}, by client and link type with the links. Check each link: mark it Pass or Fail, or hit Report on it —
          only the associate who did the link is notified.
        </p>
      </div>
      <AssociateWorkView kind={kind} associates={associates} date={date} today={today} />
    </div>
  );
}
