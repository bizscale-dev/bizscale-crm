/**
 * Simple 16-day month tracking (no complex cycling)
 * 16 calendar days (Mon-Sun) = 1 month
 * When 16 days are done, next month starts on 1st of next calendar month
 */

/**
 * Check if campaign is in progress or completed
 */
export function isCampaignComplete(campaignStartDate, today = new Date()) {
  const start = new Date(campaignStartDate);
  start.setHours(0, 0, 0, 0);

  const todayDate = new Date(today);
  todayDate.setHours(0, 0, 0, 0);

  // Calculate days elapsed
  const diffTime = todayDate - start;
  const daysElapsed = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // Campaign is complete after 16 days (day 16 is the last day, so >= 16)
  return daysElapsed >= 16;
}

/**
 * Get next month's first date
 */
export function getNextMonthFirstDate(currentMonthEndDate) {
  const endDate = new Date(currentMonthEndDate);
  const nextMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 1);
  return nextMonth.toISOString().split('T')[0];
}

const CYCLE_LENGTH_DAYS = 16;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Parse a 'YYYY-MM-DD' string (or Date) into a UTC-midnight timestamp (ms), so all
// arithmetic stays timezone-safe — these dates have no time-of-day meaning.
function toUtcMs(date) {
  if (date instanceof Date) {
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  }
  const [y, m, d] = String(date).split('T')[0].split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function addDaysUtc(ms, days) {
  return ms + days * MS_PER_DAY;
}

function toDateStr(ms) {
  return new Date(ms).toISOString().split('T')[0];
}

/**
 * Which 16-day campaign cycle (0-based) a given date falls in, relative to campaignStartDate.
 */
export function getCycleIndex(campaignStartDate, date) {
  const start = toUtcMs(campaignStartDate);
  const target = toUtcMs(date);
  const daysElapsed = Math.round((target - start) / MS_PER_DAY);
  return Math.max(0, Math.floor(daysElapsed / CYCLE_LENGTH_DAYS));
}

/**
 * Start/end dates (inclusive, YYYY-MM-DD) of a given 16-day cycle index.
 */
export function getCycleBounds(campaignStartDate, cycleIndex) {
  const startMs = toUtcMs(campaignStartDate);
  const cycleStartMs = addDaysUtc(startMs, cycleIndex * CYCLE_LENGTH_DAYS);
  const cycleEndMs = addDaysUtc(cycleStartMs, CYCLE_LENGTH_DAYS - 1);
  return { cycleStart: toDateStr(cycleStartMs), cycleEnd: toDateStr(cycleEndMs) };
}

/**
 * Compute a new funnel enrollee's Month 1 window.
 * Days 1-8 of the current cycle: month 1 ends with the current cycle.
 * Days 9-16 of the current cycle: month 1 merges into the next cycle too (no short first month).
 */
export function computeFunnelMonth1Window(campaignStartDate, enrollDate) {
  const cycleIndexAtEnroll = getCycleIndex(campaignStartDate, enrollDate);
  const { cycleStart, cycleEnd } = getCycleBounds(campaignStartDate, cycleIndexAtEnroll);
  const dayInCycle = Math.round((toUtcMs(enrollDate) - toUtcMs(cycleStart)) / MS_PER_DAY) + 1;

  const monthEndDate = dayInCycle <= 8
    ? cycleEnd
    : getCycleBounds(campaignStartDate, cycleIndexAtEnroll + 1).cycleEnd;

  return { funnelMonth: 1, monthEndDate, cycleIndexAtEnroll };
}

/**
 * Compute the window for funnel month 2 or 3, given the prior month's end date
 * (always exactly a cycle-end date by construction).
 */
export function computeFunnelNextMonthWindow(campaignStartDate, priorMonthEndDate, nextMonthNumber) {
  const nextCycleIndex = getCycleIndex(campaignStartDate, priorMonthEndDate) + 1;
  const { cycleEnd } = getCycleBounds(campaignStartDate, nextCycleIndex);
  return { funnelMonth: nextMonthNumber, monthEndDate: cycleEnd };
}
