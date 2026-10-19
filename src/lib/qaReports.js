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
