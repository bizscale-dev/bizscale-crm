// How long a manager has to resolve a QA report before it counts as overdue.
export const QA_RESOLVE_DAYS = 5;

// SQL fragment for a report's deadline — computed from created_at rather
// than stored, so the rule lives in one place. Usable as `${QA_DUE_SQL('q')}`.
export const qaDueSql = (alias = 'q') => `datetime(${alias}.created_at, '+${QA_RESOLVE_DAYS} days')`;
