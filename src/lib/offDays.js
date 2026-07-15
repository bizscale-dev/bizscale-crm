import { getDb } from './db';

/**
 * All off-days (holidays) for a campaign as a Set of 'YYYY-MM-DD' strings,
 * for fast lookup during task generation.
 */
export async function getOffDaysSet(campaignId) {
  const db = await getDb();
  const rows = await db.prepare('SELECT off_date FROM campaign_off_days WHERE campaign_id = ?').all(campaignId);
  return new Set(rows.map(r => r.off_date));
}

/**
 * All off-days for a campaign as full rows (date + reason), for display in the UI.
 */
export async function listOffDays(campaignId) {
  const db = await getDb();
  return db.prepare('SELECT * FROM campaign_off_days WHERE campaign_id = ? ORDER BY off_date').all(campaignId);
}

export async function addOffDay(campaignId, dateStr, reason = null) {
  const db = await getDb();
  const existing = await db.prepare('SELECT id FROM campaign_off_days WHERE campaign_id = ? AND off_date = ?').get(campaignId, dateStr);

  if (existing) {
    await db.prepare('UPDATE campaign_off_days SET reason = ? WHERE id = ?').run(reason, existing.id);
  } else {
    await db.prepare('INSERT INTO campaign_off_days (campaign_id, off_date, reason) VALUES (?, ?, ?)').run(campaignId, dateStr, reason);
  }
}

export async function removeOffDay(campaignId, dateStr) {
  const db = await getDb();
  await db.prepare('DELETE FROM campaign_off_days WHERE campaign_id = ? AND off_date = ?').run(campaignId, dateStr);
}

/**
 * Toggle a date on/off for a campaign. Returns the new state.
 */
export async function toggleOffDay(campaignId, dateStr, reason = null) {
  const db = await getDb();
  const existing = await db.prepare('SELECT id FROM campaign_off_days WHERE campaign_id = ? AND off_date = ?').get(campaignId, dateStr);

  if (existing) {
    await removeOffDay(campaignId, dateStr);
    return { offDay: false };
  }

  await addOffDay(campaignId, dateStr, reason);
  return { offDay: true };
}

/**
 * True if the given date (Date object) is a weekend (Sat/Sun).
 */
export function isWeekend(date) {
  const dow = date.getDay();
  return dow === 0 || dow === 6;
}

/**
 * Collect `totalDays` actual working days starting from campaignStartDate, skipping
 * weekends and the given off-days set. The calendar range extends as far as needed —
 * total_days means working days, not a fixed calendar span (a 16-calendar-day span
 * can never contain 16 working days, since it always crosses at least one weekend,
 * usually two). Returns [{ dayNumber: 1..totalDays, dateStr: 'YYYY-MM-DD' }].
 */
export function getWorkingDays(campaignStartDate, totalDays, offDaysSet = new Set()) {
  const days = [];
  const [y, m, d] = String(campaignStartDate).split('T')[0].split('-').map(Number);
  const startMs = Date.UTC(y, m - 1, d);
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  let offset = 0;
  const maxOffset = totalDays * 3 + 14; // safety cap against pathological all-off-days campaigns

  while (days.length < totalDays && offset < maxOffset) {
    // Pure UTC arithmetic throughout — mixing local Date methods (getDay/setDate) with
    // toISOString() (always UTC) shifts the date by a day in any timezone ahead of UTC.
    const dateMs = startMs + offset * MS_PER_DAY;
    offset++;

    const dateObj = new Date(dateMs);
    const dow = dateObj.getUTCDay();
    const dateStr = dateObj.toISOString().split('T')[0];
    if (dow === 0 || dow === 6 || offDaysSet.has(dateStr)) continue;

    days.push({ dayNumber: days.length + 1, dateStr });
  }

  return days;
}
