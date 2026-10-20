import { createNotificationsForUsers } from '@/lib/notifications';

// How long a manager has to resolve a QA report before it counts as overdue.
export const QA_RESOLVE_DAYS = 5;

// Saturdays and Sundays are off days, so they don't count toward the window.
// Weekdays are judged in Pakistan time (UTC+5), where the team works.
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const toUtcMs = (s) => new Date(s.replace(' ', 'T') + 'Z').getTime();
const fmtUtc = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

// created_at (UTC 'YYYY-MM-DD HH:MM:SS') + QA_RESOLVE_DAYS working days,
// keeping the time of day. Filed on a weekend, the count starts on Monday.
export function qaDueAt(createdAt) {
  let ms = toUtcMs(createdAt);
  let left = QA_RESOLVE_DAYS;
  while (left > 0) {
    ms += DAY_MS;
    const dow = new Date(ms + PKT_OFFSET_MS).getUTCDay();
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return fmtUtc(ms);
}

// QA re-checks a report this many working days after filing.
export const QA_FOLLOWUP_DAYS = 2;

const pktDate = (ms) => new Date(ms + PKT_OFFSET_MS).toISOString().slice(0, 10);

// Pakistan-time calendar date ('YYYY-MM-DD') on which QA should follow up.
export function qaFollowUpDate(createdAt) {
  let ms = toUtcMs(createdAt);
  let left = QA_FOLLOWUP_DAYS;
  while (left > 0) {
    ms += DAY_MS;
    const dow = new Date(ms + PKT_OFFSET_MS).getUTCDay();
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return pktDate(ms);
}

// Unchecked reports whose follow-up date has arrived, oldest first.
export async function fetchDueFollowUps(db) {
  const rows = await db.prepare(`
    SELECT q.id, q.source, q.title, q.web_client_name, q.client_names, q.work_done, q.note, q.page_url, q.report_date,
      q.severity, q.status, q.created_at, q.resolved_at, q.resolution_note, q.followup_notified_at,
      q.manager_id, m.name as manager_name, f.name as filed_by
    FROM qa_reports q
    JOIN users m ON m.id = q.manager_id
    JOIN users f ON f.id = q.qa_user_id
    WHERE q.followup_checked_at IS NULL
    ORDER BY q.created_at ASC
  `).all();
  const today = pktDate(Date.now());
  return rows
    .map((r) => ({ ...r, followup_date: qaFollowUpDate(r.created_at) }))
    .filter((r) => r.followup_date <= today);
}

// Notifies every QA user (once per report) about follow-ups that just came
// due. QA works as a team, so one check by anybody clears it for everyone.
export async function syncQaFollowUps(db) {
  const fresh = (await fetchDueFollowUps(db)).filter((r) => !r.followup_notified_at);
  if (fresh.length === 0) return;
  const qaUsers = await db.prepare(`SELECT id FROM users WHERE role = 'qa'`).all();
  const first = fresh[0];
  const label = first.web_client_name || first.title || 'a report';
  await createNotificationsForUsers(db, qaUsers.map((u) => u.id), {
    title: 'QA follow-up due',
    message: fresh.length === 1
      ? `${label} (${first.manager_name}) was reported ${QA_FOLLOWUP_DAYS} working days ago - check whether it's fixed`
      : `${fresh.length} reports were filed ${QA_FOLLOWUP_DAYS}+ working days ago - check whether they're fixed`,
    link: '/qa/follow-ups',
  });
  const ph = fresh.map(() => '?').join(',');
  await db.prepare(`UPDATE qa_reports SET followup_notified_at = CURRENT_TIMESTAMP WHERE id IN (${ph})`).run(...fresh.map((r) => r.id));
}

// Adds due_at (and is_overdue for open reports) to rows from qa_reports.
export function withQaDue(rows) {
  const now = fmtUtc(Date.now());
  return rows.map((r) => {
    const due_at = qaDueAt(r.created_at);
    return { ...r, due_at, is_overdue: r.status === 'open' && due_at < now ? 1 : 0 };
  });
}

export const QA_SEVERITIES = ['high', 'medium', 'low'];

// Manual (Executives) report screenshot cap — same ~2MB-of-image budget the
// task proof uploads use, inflated by base64's ~1.37x overhead.
export const QA_MAX_SCREENSHOT_BASE64 = 2 * 1024 * 1024 * 1.37;
