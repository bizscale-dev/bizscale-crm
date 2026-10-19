import { getDb } from '@/lib/db';
import { fetchDueFollowUps, syncQaFollowUps, QA_FOLLOWUP_DAYS } from '@/lib/qaReports';
import FollowUpsList from './FollowUpsList';

export const revalidate = 0;

export default async function QaFollowUpsPage() {
  const db = await getDb();
  await syncQaFollowUps(db);
  const due = await fetchDueFollowUps(db);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.35rem' }}>Follow-ups</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          Reports come back here {QA_FOLLOWUP_DAYS} working days after they were filed (Sat/Sun excluded). Re-check the
          issue, then mark it checked and it leaves this list.
        </p>
      </div>
      <FollowUpsList items={due} />
    </div>
  );
}
