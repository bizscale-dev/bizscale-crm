// How long a manager has to resolve a QA report before it counts as overdue.
export const QA_RESOLVE_DAYS = 5;

// SQL fragment for a report's deadline — computed from created_at rather
// than stored, so the rule lives in one place. Usable as `${QA_DUE_SQL('q')}`.
export const qaDueSql = (alias = 'q') => `datetime(${alias}.created_at, '+${QA_RESOLVE_DAYS} days')`;

export const QA_SEVERITIES = ['high', 'medium', 'low'];

// Manual (Executives) report screenshot cap — same ~2MB-of-image budget the
// task proof uploads use, inflated by base64's ~1.37x overhead.
export const QA_MAX_SCREENSHOT_BASE64 = 2 * 1024 * 1024 * 1.37;
