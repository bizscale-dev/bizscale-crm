// Timestamps from the database (CURRENT_TIMESTAMP) are UTC, stored as "YYYY-MM-DD HH:MM:SS" with no
// zone. `new Date(thatString).toLocaleString()` reads it as the viewer's LOCAL time and shows it in
// the viewer's zone (and differs between the server render and the browser), so submit times came
// out hours off. This reads it as UTC and always shows Pakistan time, e.g. "11/6/2026, 6:24:28 PM".
export function formatPkt(value) {
  if (!value) return '';
  const s = String(value);
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString('en-US', { timeZone: 'Asia/Karachi' });
}
