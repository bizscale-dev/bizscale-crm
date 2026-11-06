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

// Pakistan calendar day ("YYYY-MM-DD") of a stored UTC timestamp, for grouping by day.
export function pktDay(value) {
  if (!value) return '';
  const s = String(value);
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
}

// "Today" / "Yesterday" / "Wed, 4 Nov 2026" for a Pakistan day key from pktDay().
export function dayLabel(day) {
  const today = pktDay(new Date().toISOString());
  const yesterday = pktDay(new Date(Date.now() - 86400000).toISOString());
  if (day === today) return 'Today';
  if (day === yesterday) return 'Yesterday';
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'Asia/Karachi', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
