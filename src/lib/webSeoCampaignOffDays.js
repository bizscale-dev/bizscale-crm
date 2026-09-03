import { getDb } from './db';

/**
 * All off-days (holidays) for a Web SEO campaign as a Set of 'YYYY-MM-DD' strings,
 * for fast lookup during webseo_tasks generation.
 */
export async function getOffDaysSet(webSeoCampaignId) {
  const db = await getDb();
  const rows = await db.prepare('SELECT off_date FROM webseo_campaign_off_days WHERE webseo_campaign_id = ?').all(webSeoCampaignId);
  return new Set(rows.map(r => r.off_date));
}

/**
 * All off-days for a Web SEO campaign as full rows (date + reason), for display in the UI.
 */
export async function listOffDays(webSeoCampaignId) {
  const db = await getDb();
  return db.prepare('SELECT * FROM webseo_campaign_off_days WHERE webseo_campaign_id = ? ORDER BY off_date').all(webSeoCampaignId);
}

export async function addOffDay(webSeoCampaignId, dateStr, reason = null) {
  const db = await getDb();
  const existing = await db.prepare('SELECT id FROM webseo_campaign_off_days WHERE webseo_campaign_id = ? AND off_date = ?').get(webSeoCampaignId, dateStr);

  if (existing) {
    await db.prepare('UPDATE webseo_campaign_off_days SET reason = ? WHERE id = ?').run(reason, existing.id);
  } else {
    await db.prepare('INSERT INTO webseo_campaign_off_days (webseo_campaign_id, off_date, reason) VALUES (?, ?, ?)').run(webSeoCampaignId, dateStr, reason);
  }
}

export async function removeOffDay(webSeoCampaignId, dateStr) {
  const db = await getDb();
  await db.prepare('DELETE FROM webseo_campaign_off_days WHERE webseo_campaign_id = ? AND off_date = ?').run(webSeoCampaignId, dateStr);
}

/**
 * Toggle a date on/off for a Web SEO campaign. Returns the new state.
 */
export async function toggleOffDay(webSeoCampaignId, dateStr, reason = null) {
  const db = await getDb();
  const existing = await db.prepare('SELECT id FROM webseo_campaign_off_days WHERE webseo_campaign_id = ? AND off_date = ?').get(webSeoCampaignId, dateStr);

  if (existing) {
    await removeOffDay(webSeoCampaignId, dateStr);
    return { offDay: false };
  }

  await addOffDay(webSeoCampaignId, dateStr, reason);
  return { offDay: true };
}
