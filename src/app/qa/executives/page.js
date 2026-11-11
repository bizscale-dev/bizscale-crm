import { getDb } from '@/lib/db';
import { getClientOwnership } from '@/lib/qaClientOwners';
import ExecutiveReportForm from './ExecutiveReportForm';

export const revalidate = 0;

const ROLE_LABELS = {
  web_seo_manager: 'Web SEO Managers',
  seo_manager: 'SEO Managers',
  senior_seo_associate: 'Senior SEO Associates',
  writers_manager: 'Writers Managers',
  web_developer_executive: 'Web Developer Executive',
  web_developer_seo: 'Web Developer',
  graphic_designer_executive: 'Graphic Designer Executive',
  graphic_designer: 'Graphics Designers',
};

export default async function QaExecutivesPage() {
  const db = await getDb();

  const managers = await db.prepare(`
    SELECT id, name, role FROM users
    WHERE role IN ('web_seo_manager', 'seo_manager', 'writers_manager', 'senior_seo_associate', 'web_developer_executive', 'web_developer_seo', 'graphic_designer_executive', 'graphic_designer') AND is_active = 1
    ORDER BY role, name
  `).all();

  // Every SEO + web client, and which manager owns each (see qaClientOwners.js).
  const { clientNames, owners } = await getClientOwnership(db, managers);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.35rem' }}>Executives</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          File a report by hand against a manager, the Web Developer, the Executives or a Graphics Designer — pick who it is for and, if it concerns clients, the clients (a manager only gets the clients they own). It shows up on that person&apos;s Reports page (with a
          5 working-day deadline to resolve it) and in your Reports page, like the ones flagged from EODs and tasks.
        </p>
      </div>

      <ExecutiveReportForm managers={managers} clients={clientNames} owners={owners} roleLabels={ROLE_LABELS} />
    </div>
  );
}
