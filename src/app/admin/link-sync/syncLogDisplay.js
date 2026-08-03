export const SYNC_TYPE_LABELS = {
  'daily-sync': 'Daily Sync (Clients/Writers/Associates)',
  'completed-links': 'SEO Completed Links',
  'webseo-completed-links': 'Web SEO Completed Links',
  'web-clients': 'Web Clients (Add/Remove)',
  'writer-offpage': 'Writer GBP/Web-Off Tasks',
  'daily-activity-capture': 'Daily Activity Capture',
};

// created_at is stored as UTC (SQLite CURRENT_TIMESTAMP) — render in Pakistan Time
// since that's the timezone the cron schedule and the rest of this page are described in.
export function formatLogTime(isoString) {
  return new Date(`${isoString.replace(' ', 'T')}Z`).toLocaleString('en-US', {
    timeZone: 'Asia/Karachi',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
