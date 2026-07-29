import { getDb } from './db';

/**
 * All off-days (holidays) for a writer campaign as a Set of 'YYYY-MM-DD' strings,
 * for fast lookup during writer off-page task generation.
 */
export async function getOffDaysSet(writerCampaignId) {
  const db = await getDb();
  const rows = await db.prepare('SELECT off_date FROM writer_campaign_off_days WHERE writer_campaign_id = ?').all(writerCampaignId);
  return new Set(rows.map(r => r.off_date));
}

/**
 * All off-days for a writer campaign as full rows (date + reason), for display in the UI.
 */
export async function listOffDays(writerCampaignId) {
  const db = await getDb();
  return db.prepare('SELECT * FROM writer_campaign_off_days WHERE writer_campaign_id = ? ORDER BY off_date').all(writerCampaignId);
}

export async function addOffDay(writerCampaignId, dateStr, reason = null) {
  const db = await getDb();
  const existing = await db.prepare('SELECT id FROM writer_campaign_off_days WHERE writer_campaign_id = ? AND off_date = ?').get(writerCampaignId, dateStr);

  if (existing) {
    await db.prepare('UPDATE writer_campaign_off_days SET reason = ? WHERE id = ?').run(reason, existing.id);
  } else {
    await db.prepare('INSERT INTO writer_campaign_off_days (writer_campaign_id, off_date, reason) VALUES (?, ?, ?)').run(writerCampaignId, dateStr, reason);
  }
}

export async function removeOffDay(writerCampaignId, dateStr) {
  const db = await getDb();
  await db.prepare('DELETE FROM writer_campaign_off_days WHERE writer_campaign_id = ? AND off_date = ?').run(writerCampaignId, dateStr);
}

/**
 * Toggle a date on/off for a writer campaign. Returns the new state.
 */
export async function toggleOffDay(writerCampaignId, dateStr, reason = null) {
  const db = await getDb();
  const existing = await db.prepare('SELECT id FROM writer_campaign_off_days WHERE writer_campaign_id = ? AND off_date = ?').get(writerCampaignId, dateStr);

  if (existing) {
    await removeOffDay(writerCampaignId, dateStr);
    return { offDay: false };
  }

  await addOffDay(writerCampaignId, dateStr, reason);
  return { offDay: true };
}
