import { getDb } from '@/lib/db';
import { getClientOwnership } from '@/lib/qaClientOwners';
import ExecutiveReportForm from './ExecutiveReportForm';

export const revalidate = 0;

const ROLE_LABELS = {
  web_seo_manager: 'Web SEO Managers',
  seo_manager: 'SEO Managers',
  writers_manager: 'Writers Managers',
};

export default async function QaExecutivesPage() {
  const db = await getDb();

  const managers = await db.prepare(`
    SELECT id, name, role FROM users
    WHERE role IN ('web_seo_manager', 'seo_manager', 'writers_manager') AND is_active = 1
    ORDER BY role, name
  `).all();

  // Every SEO + web client, and which manager owns each (see qaClientOwners.js).
  const { clientNames, owners } = await getClientOwnership(db, managers);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.35rem' }}>Executives</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          File a report against a manager by hand — pick the managers and the clients it concerns (each manager only gets the clients they own). It shows up on that manager&apos;s Reports page (with a
          5 working-day deadline to resolve it) and in your Reports page, like the ones flagged from EODs and tasks.
        </p>
      </div>

      <ExecutiveReportForm managers={managers} clients={clientNames} owners={owners} roleLabels={ROLE_LABELS} />
    </div>
  );
}
