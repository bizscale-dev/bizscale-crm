import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { CHECK_TARGETS, CHECKED_ROLES } from '@/lib/taskCheck';
import CheckClient from '@/components/taskcheck/CheckClient';
import ReportsClient from '@/components/taskcheck/ReportsClient';
import EodView from '@/app/hr/eod/EodView';
import ManagerQaReports from '@/components/ManagerQaReports';
import { QA_RESOLVE_DAYS, withQaDue, attachComments } from '@/lib/qaReports';
import { resolveQaReport } from '@/lib/taskCheckActions';

// Server renderers shared by the Web Developer Executive and Graphic Designer Executive portals
// (`checks` and `reports` pages), and by the reported side's own Reports page.

async function requireExec() {
  const session = await verifySession();
  const cfg = session ? CHECK_TARGETS[session.role] : null;
  if (!cfg) redirect('/');
  return { session, cfg };
}

function Heading({ title, children }) {
  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.35rem' }}>{title}</h1>
      <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>{children}</p>
    </div>
  );
}

/** Every task the team submitted, newest first, for Pass / Fail / Report. */
export async function renderCheckPage() {
  const { cfg } = await requireExec();
  const db = await getDb();
  const people = await db.prepare('SELECT id, name FROM users WHERE role = ? AND is_active = 1 ORDER BY name').all(cfg.targetRole);

  const tasks = await db.prepare(`
    SELECT t.id AS task_id, t.task_text, t.due_date, t.due_time, t.template_id, t.urgency,
      m.name AS assigned_by,
      a.id AS assignee_id, a.user_id, u.name AS assignee_name,
      a.submitted_at, a.submission_description, (a.proof_image_base64 IS NOT NULL AND a.proof_image_base64 != '') AS has_proof,
      a.is_late, a.late_reason,
      c.status AS check_status,
      (SELECT COUNT(*) FROM task_check_reports r WHERE r.task_id = t.id AND r.user_id = a.user_id) AS report_count
    FROM associate_task_assignees a
    JOIN associate_tasks t ON t.id = a.task_id
    JOIN users u ON u.id = a.user_id AND u.role = ?
    LEFT JOIN users m ON m.id = t.created_by
    LEFT JOIN task_checks c ON c.task_id = t.id AND c.user_id = a.user_id
    WHERE a.submitted_at IS NOT NULL
    ORDER BY a.submitted_at DESC
    LIMIT 300
  `).all(cfg.targetRole);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Heading title="Task Checks">
        Every task the {cfg.targetLabel} has submitted, newest first. Open a task to see what was done and the proof, then mark it Pass or Fail, or Report it —
        the {cfg.targetLabel} is notified and has to fix it.
      </Heading>
      <CheckClient
        tasks={tasks.map((t) => ({ ...t, has_proof: !!t.has_proof }))}
        targetLabel={cfg.targetLabel}
        people={people}
      />
    </div>
  );
}

/** The Executive's view of every report on the team's tasks, to confirm or send back fixes. */
export async function renderExecReportsPage() {
  const { cfg } = await requireExec();
  const db = await getDb();
  const people = await db.prepare('SELECT id, name FROM users WHERE role = ? AND is_active = 1 ORDER BY name').all(cfg.targetRole);
  const reports = await db.prepare(`
    SELECT r.*, u.name AS assignee_name, e.name AS reporter_name, e.role AS reporter_role
    FROM task_check_reports r
    JOIN users u ON u.id = r.user_id AND u.role = ?
    LEFT JOIN users e ON e.id = r.created_by
    ORDER BY (r.status = 'pending_review') DESC, r.created_at DESC, r.id DESC
  `).all(cfg.targetRole);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Heading title="Reports">
        Tasks reported to the {cfg.targetLabel}. When they say it is fixed it waits here for your check: confirm it, or send it back.
      </Heading>
      <ReportsClient reports={reports} mode="exec" people={people} />
    </div>
  );
}

/** The team's end-of-day reports (the same eod_reports the Web SEO managers file), for the Executive. */
export async function renderExecEodPage() {
  const { cfg } = await requireExec();
  const db = await getDb();
  const rows = await db.prepare(`
    SELECT r.id AS report_id, r.report_date, u.id AS manager_id, u.name AS manager_name,
      e.id AS entry_id, e.web_client_name, e.page_url, e.work_done, e.description
    FROM eod_reports r
    JOIN users u ON u.id = r.user_id AND u.role = ?
    JOIN eod_report_entries e ON e.report_id = r.id
    ORDER BY r.report_date DESC, u.name ASC, e.id ASC
  `).all(cfg.targetRole);
  const byReport = new Map();
  for (const row of rows) {
    if (!byReport.has(row.report_id)) {
      byReport.set(row.report_id, { id: row.report_id, report_date: row.report_date, manager_id: row.manager_id, manager_name: row.manager_name, manager_role: cfg.targetLabel, entries: [] });
    }
    byReport.get(row.report_id).entries.push({ id: row.entry_id, web_client_name: row.web_client_name, page_url: row.page_url, work_done: row.work_done, description: row.description });
  }
  return <EodView reports={[...byReport.values()]} description={`End-of-day reports filed by the ${cfg.targetLabel}s, newest first.`} />;
}

/** The reported person's own list: what they have to fix. */
export async function renderMyReportsPage() {
  const session = await verifySession();
  if (!session || !CHECKED_ROLES.includes(session.role)) redirect('/');
  const db = await getDb();
  const reports = await db.prepare(`
    SELECT r.*, e.name AS reporter_name, e.role AS reporter_role FROM task_check_reports r
    LEFT JOIN users e ON e.id = r.created_by
    WHERE r.user_id = ?
    ORDER BY (r.status = 'open') DESC, r.created_at DESC, r.id DESC
  `).all(session.userId);

  const qaRows = await db.prepare(`
    SELECT q.id, q.report_date, q.web_client_name, q.page_url, q.work_done, q.note,
      q.source, q.title, q.location, q.issue, q.department, q.severity, (q.screenshot_base64 IS NOT NULL AND q.screenshot_base64 != '') AS has_screenshot, q.client_names,
      q.status, q.created_at, q.resolve_days, q.resolved_at, q.resolution_note, q.rejection_count,
      f.name AS filed_by
    FROM qa_reports q JOIN users f ON f.id = q.qa_user_id
    WHERE q.manager_id = ?
    ORDER BY CASE q.status WHEN 'open' THEN 0 ELSE 1 END, CASE q.status WHEN 'open' THEN q.created_at END ASC, q.resolved_at DESC
  `).all(session.userId);
  const qaReports = await attachComments(db, withQaDue(qaRows));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Heading title="Reports">
        Tasks your Executive reported. Fix them, then mark each as fixed — they check it and confirm.
      </Heading>
      <ReportsClient reports={reports} mode="mine" />
      {qaReports.length > 0 && (
        <>
          <Heading title="QA Reports">Issues QA flagged on your work. Fix them and submit the fix � QA confirms it.</Heading>
          <ManagerQaReports reports={qaReports} resolveAction={resolveQaReport} resolveDays={QA_RESOLVE_DAYS} />
        </>
      )}
    </div>
  );
}
