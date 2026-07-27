import { getDb } from './db';
import { getOffDaysSet, getWorkingDays } from './offDays';

const LINK_TYPES = { web2: 'webseo_web2_target', guestpost: 'webseo_guestpost_target' };

/**
 * Web SEO Associate task schedule: each associate's clients are split into 3 batches
 * (A/B/C) of roughly equal size. Batches rotate A→B→C→A... across the campaign's
 * working days (weekends and admin-marked off-days skipped, same as the SEO/writer
 * generators), so each visit only a third of an associate's clients are worked.
 *
 * Because 16 working days doesn't divide evenly by 3, batches don't all get the same
 * number of visits (e.g. batch A gets 6, batches B/C get 5 over 16 days) — the per-visit
 * target count is computed per client so the monthly total still lands exactly on the
 * campaign's configured target regardless of which batch a client is in.
 */
export async function generateWebSeoTasks(campaignId) {
  const db = await getDb();
  const campaign = await db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const totalDays = campaign.total_days || 16;
  const offDays = await getOffDaysSet(campaignId);

  const monthlyTargets = {};
  for (const [type, field] of Object.entries(LINK_TYPES)) {
    monthlyTargets[type] = campaign[field] ?? 0;
  }

  // total_days means working days — the calendar range extends past weekends/off-days
  // as needed to fit all of them, same as generateSEOTasks/generateWriterTasks.
  const workingDays = getWorkingDays(campaign.start_date, totalDays, offDays);

  const associates = await db.prepare(`
    SELECT DISTINCT u.id, u.name
    FROM users u
    JOIN web_clients wc ON wc.assigned_associate_id = u.id AND wc.campaign_id = ? AND wc.is_active = 1
    WHERE u.role = 'web_seo_associate' AND u.is_active = 1
    ORDER BY u.name
  `).all(campaignId);

  // Regeneration wipes and rebuilds every task row (needed since adding/removing a
  // client shifts batch assignments), which would otherwise reset completed_count to 0
  // for every already-passed visit — the completed-links sync only ever writes to
  // *today's* row, so a wiped past visit can never be refilled. Snapshot existing
  // progress first, keyed by (client, day, post type) — that combination stays stable
  // across regenerations since new clients are appended to a batch rather than inserted
  // into existing slots — so it can be re-applied to the freshly generated rows below.
  const priorCompleted = new Map();
  const priorRows = await db.prepare(`
    SELECT client_id, day_number, post_type, completed_count
    FROM webseo_tasks
    WHERE campaign_id = ? AND completed_count > 0
  `).all(campaignId);
  for (const row of priorRows) {
    priorCompleted.set(`${row.client_id}|${row.day_number}|${row.post_type}`, row.completed_count);
  }

  // Writers doing "Web Tasks" mirror one Web SEO Associate's exact schedule (same
  // client, day, post type, target count) so they can write the actual posts for that
  // associate's clients. Their completed_count is tracked independently (their own
  // logging via web_writing_logs), so it gets the same snapshot-and-restore treatment
  // as the associate's rows above, just in its own table/map.
  const writersByAssociate = new Map();
  const mirrorWriters = await db.prepare(`
    SELECT id, mirrors_web_associate_id FROM users
    WHERE role = 'writer' AND is_active = 1 AND mirrors_web_associate_id IS NOT NULL
  `).all();
  for (const w of mirrorWriters) {
    if (!writersByAssociate.has(w.mirrors_web_associate_id)) writersByAssociate.set(w.mirrors_web_associate_id, []);
    writersByAssociate.get(w.mirrors_web_associate_id).push(w.id);
  }

  const priorWriterCompleted = new Map();
  const priorWriterRows = await db.prepare(`
    SELECT writer_id, client_id, day_number, post_type, completed_count
    FROM web_writing_tasks
    WHERE campaign_id = ? AND completed_count > 0
  `).all(campaignId);
  for (const row of priorWriterRows) {
    priorWriterCompleted.set(`${row.writer_id}|${row.client_id}|${row.day_number}|${row.post_type}`, row.completed_count);
  }

  await db.prepare('DELETE FROM webseo_tasks WHERE campaign_id = ?').run(campaignId);
  await db.prepare('DELETE FROM web_writing_tasks WHERE campaign_id = ?').run(campaignId);

  const rows = [];
  const writerRows = [];

  for (const associate of associates) {
    const clients = await db.prepare(`
      SELECT id FROM web_clients WHERE campaign_id = ? AND assigned_associate_id = ? AND is_active = 1 ORDER BY id
    `).all(campaignId, associate.id);

    if (clients.length === 0) continue;

    // Split into 3 batches as evenly as possible (e.g. 17 -> 6/6/5, 18 -> 6/6/6).
    const base = Math.floor(clients.length / 3);
    const remainder = clients.length % 3;
    const batches = [[], [], []];
    let idx = 0;
    for (let b = 0; b < 3; b++) {
      const size = base + (b < remainder ? 1 : 0);
      batches[b] = clients.slice(idx, idx + size);
      idx += size;
    }

    for (let b = 0; b < 3; b++) {
      const batchClients = batches[b];
      if (batchClients.length === 0) continue;

      // This batch's visit days: every 3rd working day starting at offset b.
      const visitDays = workingDays.filter((_, i) => i % 3 === b);
      const visitCount = visitDays.length;
      if (visitCount === 0) continue;

      for (const client of batchClients) {
        for (const [postType, monthlyTarget] of Object.entries(monthlyTargets)) {
          if (monthlyTarget <= 0) continue;

          // Distribute the monthly target across this batch's visits so the total
          // exactly equals monthlyTarget regardless of how many visits the batch gets.
          const perVisitBase = Math.floor(monthlyTarget / visitCount);
          const extraVisits = monthlyTarget % visitCount;

          visitDays.forEach((visit, vIdx) => {
            const count = perVisitBase + (vIdx < extraVisits ? 1 : 0);
            if (count > 0) {
              const priorKey = `${client.id}|${visit.dayNumber}|${postType}`;
              rows.push({
                campaign_id: campaignId,
                client_id: client.id,
                associate_id: associate.id,
                day_number: visit.dayNumber,
                task_date: visit.dateStr,
                post_type: postType,
                target_count: count,
                completed_count: priorCompleted.get(priorKey) || 0,
              });

              for (const writerId of writersByAssociate.get(associate.id) || []) {
                const priorWriterKey = `${writerId}|${client.id}|${visit.dayNumber}|${postType}`;
                writerRows.push({
                  campaign_id: campaignId,
                  client_id: client.id,
                  writer_id: writerId,
                  associate_id: associate.id,
                  day_number: visit.dayNumber,
                  task_date: visit.dateStr,
                  post_type: postType,
                  target_count: count,
                  completed_count: priorWriterCompleted.get(priorWriterKey) || 0,
                });
              }
            }
          });
        }
      }
    }
  }

  if (rows.length > 0) {
    const insertSql = `
      INSERT INTO webseo_tasks (campaign_id, client_id, associate_id, day_number, task_date, post_type, target_count, completed_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await db.batch(rows.map(r => ({
      sql: insertSql,
      args: [r.campaign_id, r.client_id, r.associate_id, r.day_number, r.task_date, r.post_type, r.target_count, r.completed_count],
    })));
  }

  if (writerRows.length > 0) {
    const insertWriterSql = `
      INSERT INTO web_writing_tasks (campaign_id, client_id, writer_id, associate_id, day_number, task_date, post_type, target_count, completed_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await db.batch(writerRows.map(r => ({
      sql: insertWriterSql,
      args: [r.campaign_id, r.client_id, r.writer_id, r.associate_id, r.day_number, r.task_date, r.post_type, r.target_count, r.completed_count],
    })));
  }

  return { success: true, taskCount: rows.length, associateCount: associates.length, writerTaskCount: writerRows.length };
}
