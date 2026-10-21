// Shared by the QA Stats and Clients Stats pages (client-side only — dates
// are bucketed in the viewer's local timezone, since "which day was this
// filed" depends on where the person is, not on UTC).
export const SOURCES = [
  { key: 'eod', label: 'EOD flags', color: '#16b293' },
  { key: 'manager_task', label: 'Task flags', color: '#3b82f6' },
  { key: 'manual', label: 'Manual reports', color: '#f59e0b' },
];

const pad = (n) => String(n).padStart(2, '0');
const DAY_MS = 24 * 60 * 60 * 1000;

export const parseUtc = (s) => new Date(String(s).replace(' ', 'T') + 'Z');
export const toLocalDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const filedDate = (report) => toLocalDateStr(parseUtc(report.created_at));
const dateFromStr = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

export function monthRange(todayStr, offset = 0) {
  const [y, m] = todayStr.split('-').map(Number);
  return {
    from: toLocalDateStr(new Date(y, m - 1 + offset, 1)),
    to: toLocalDateStr(new Date(y, m + offset, 0)),
  };
}

export function lastNDays(todayStr, n) {
  const end = dateFromStr(todayStr);
  const start = new Date(end.getTime() - (n - 1) * DAY_MS);
  return { from: toLocalDateStr(start), to: toLocalDateStr(end) };
}

export const inRange = (dateStr, from, to) => (!from || dateStr >= from) && (!to || dateStr <= to);

export function formatDay(dateStr) {
  return dateFromStr(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function isOverdue(report, nowMs) {
  return report.status === 'open' && parseUtc(report.due_at).getTime() < nowMs;
}

export function statusOf(report, nowMs) {
  if (report.status === 'resolved') return 'resolved';
  if (report.status === 'pending_review') return 'review';
  return isOverdue(report, nowMs) ? 'overdue' : 'open';
}

export function summarize(reports, nowMs) {
  const bySource = { eod: 0, manager_task: 0, manual: 0 };
  const bySeverity = { high: 0, medium: 0, low: 0 };
  let open = 0, overdue = 0, resolved = 0, onTime = 0, resolveDaysTotal = 0;

  for (const r of reports) {
    bySource[r.source] = (bySource[r.source] || 0) + 1;
    if (r.severity && bySeverity[r.severity] !== undefined) bySeverity[r.severity] += 1;
    if (r.status === 'resolved') {
      resolved += 1;
      const days = (parseUtc(r.resolved_at) - parseUtc(r.created_at)) / DAY_MS;
      resolveDaysTotal += Math.max(0, days);
      if (parseUtc(r.resolved_at) <= parseUtc(r.due_at)) onTime += 1;
    } else {
      open += 1;
      if (isOverdue(r, nowMs)) overdue += 1;
    }
  }

  return {
    total: reports.length, open, overdue, resolved, bySource, bySeverity,
    avgResolveDays: resolved ? resolveDaysTotal / resolved : null,
    onTimePct: resolved ? Math.round((onTime / resolved) * 100) : null,
  };
}

// Daily buckets for a range up to ~6 weeks, weekly beyond that (so a long
// range still draws a readable chart). With no range set, spans the data.
export function bucketize(reports, from, to) {
  const dates = reports.map(filedDate).sort();
  const start = from || dates[0];
  const end = to || dates[dates.length - 1];
  if (!start || !end || start > end) return { buckets: [], unit: 'day' };

  const startD = dateFromStr(start);
  const totalDays = Math.min(400, Math.round((dateFromStr(end) - startD) / DAY_MS) + 1);
  const weekly = totalDays > 45;
  const size = weekly ? 7 : 1;

  const buckets = [];
  for (let offset = 0; offset < totalDays; offset += size) {
    const first = new Date(startD.getTime() + offset * DAY_MS);
    const last = new Date(startD.getTime() + Math.min(offset + size, totalDays) * DAY_MS - DAY_MS);
    buckets.push({
      from: toLocalDateStr(first),
      to: toLocalDateStr(last),
      label: weekly ? formatDay(toLocalDateStr(first)) : String(first.getDate()),
      counts: { eod: 0, manager_task: 0, manual: 0 },
      total: 0,
    });
  }
  for (const r of reports) {
    const d = filedDate(r);
    const b = buckets.find((x) => d >= x.from && d <= x.to);
    if (b) {
      b.counts[r.source] = (b.counts[r.source] || 0) + 1;
      b.total += 1;
    }
  }
  return { buckets, unit: weekly ? 'week' : 'day' };
}
