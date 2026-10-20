import { getDb } from '@/lib/db';
import { withQaDue } from '@/lib/qaReports';
import { getClientOwnership } from '@/lib/qaClientOwners';
import ClientsStatsClient from './ClientsStatsClient';

export const revalidate = 0;

export default async function QaClientsStatsPage() {
  const db = await getDb();

  // Every client currently on the SEO or web sheet (same roster as the Executives page).
  const { clientNames } = await getClientOwnership(db, []);

  // Issues QA raised on a client = reports flagged from EOD entries, plus
  // manual (Executives) reports, which now name a client. Older manual
  // reports were filed under a free-text title instead (title IS NOT NULL) —
  // those aren't tied to a client, so they're left out. Task reports never are.
  const rawRows = await db.prepare(`
    SELECT q.id, q.source, q.severity, q.status, q.created_at, q.resolved_at, q.resolution_note,
      q.report_date, q.web_client_name, q.client_names, q.issue_group, q.page_url, q.work_done, q.note,
      q.location, q.issue, q.department,
      q.manager_id, m.name as manager_name, f.name as filed_by
    FROM qa_reports q
    JOIN users m ON m.id = q.manager_id
    JOIN users f ON f.id = q.qa_user_id
    WHERE q.source = 'eod' OR (q.source = 'manual' AND q.title IS NULL AND q.web_client_name != '')
    ORDER BY q.created_at DESC
  `).all();

  // A manual issue can cover many clients and go to several managers. Count it
  // once per client (not once per manager): expand each report into one entry
  // per client, then merge the managers' copies of the same submission.
  const entries = new Map();
  for (const r of rawRows) {
    const clientsOfReport = r.client_names ? r.client_names.split('\n').filter(Boolean) : [r.web_client_name];
    for (const client of clientsOfReport) {
      const key = `${r.issue_group || `r${r.id}`}|${client.toLowerCase()}`;
      const existing = entries.get(key);
      if (!existing) {
        entries.set(key, { ...r, id: `${r.id}:${client}`, web_client_name: client, manager_ids: [r.manager_id], manager_names: [r.manager_name] });
        continue;
      }
      existing.manager_ids.push(r.manager_id);
      existing.manager_names.push(r.manager_name);
      // The client's issue is only resolved once every manager has resolved it.
      if (r.status === 'open') {
        existing.status = 'open';
        existing.resolved_at = null;
      } else if (existing.status !== 'open' && r.resolved_at > existing.resolved_at) {
        existing.resolved_at = r.resolved_at;
      }
    }
  }
  const rows = [...entries.values()].map((e) => ({ ...e, manager_name: e.manager_names.join(', ') }));

  const today = new Date().toISOString().split('T')[0];

  return <ClientsStatsClient reports={withQaDue(rows)} clients={clientNames} today={today} />;
}
