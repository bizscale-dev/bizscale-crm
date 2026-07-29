import { getDb } from '@/lib/db';
import { getActiveWriterCampaign } from '@/lib/services';
import { verifySession } from '@/lib/session';
import WriterTasksClient from './WriterTasksClient';

export const revalidate = 0; // Disable caching for real-time data

function groupByClient(tasks) {
  const byClient = {};
  tasks.forEach(t => {
    if (!byClient[t.client_id]) {
      byClient[t.client_id] = {
        client_id: t.client_id,
        client_name: t.client_name,
        website: t.website,
        tasks: [],
      };
    }
    byClient[t.client_id].tasks.push(t);
  });
  return Object.values(byClient);
}

async function loadOffpageSection(db, userId, writerCampaignId, taskType, date, today) {
  const tasks = await db.prepare(`
    SELECT wot.*, c.name as client_name, c.website
    FROM writer_offpage_tasks wot
    JOIN clients c ON c.id = wot.client_id
    WHERE wot.writer_id = ? AND wot.writer_campaign_id = ? AND wot.task_type = ? AND wot.task_date = ? AND c.is_active = 1
    ORDER BY c.name, wot.category
  `).all(userId, writerCampaignId, taskType, date);

  const availableDates = await db.prepare(`
    SELECT DISTINCT wot.task_date, wot.day_number
    FROM writer_offpage_tasks wot
    JOIN clients c ON c.id = wot.client_id
    WHERE wot.writer_id = ? AND wot.writer_campaign_id = ? AND wot.task_type = ? AND c.is_active = 1
    ORDER BY wot.task_date
  `).all(userId, writerCampaignId, taskType);

  // Pending — the task's scheduled day has already passed (relative to today, not
  // whichever date is currently selected in the picker) but it's still not fully
  // done (the sheet's Status column hasn't caught up to Done for it yet).
  const pendingTasks = await db.prepare(`
    SELECT wot.*, c.name as client_name, c.website
    FROM writer_offpage_tasks wot
    JOIN clients c ON c.id = wot.client_id
    WHERE wot.writer_id = ? AND wot.writer_campaign_id = ? AND wot.task_type = ?
      AND wot.task_date < ? AND wot.completed_count < wot.target_count AND c.is_active = 1
    ORDER BY wot.task_date DESC, c.name, wot.category
  `).all(userId, writerCampaignId, taskType, today);

  return {
    tasksByClient: groupByClient(tasks),
    availableDates,
    pendingTasksByClient: groupByClient(pendingTasks),
  };
}

export default async function WriterTasksPage({ searchParams }) {
  const db = await getDb();
  const session = await verifySession();
  const userId = session.userId;
  const writerCampaign = await getActiveWriterCampaign();
  const today = new Date().toISOString().split('T')[0];
  const resolvedSearchParams = await searchParams;
  const date = resolvedSearchParams?.date || today;

  let gbp = { tasksByClient: [], availableDates: [], pendingTasksByClient: [] };
  let weboff = { tasksByClient: [], availableDates: [], pendingTasksByClient: [] };

  if (writerCampaign) {
    // GBP-Off Page / Web-Off Page — read-only, sourced from the Google Sheet tabs
    // (see src/lib/writerOffpageSync.js). Writers mark work Done directly in the
    // sheet; this is a live progress mirror, not an in-app checklist.
    gbp = await loadOffpageSection(db, userId, writerCampaign.id, 'gbp', date, today);
    weboff = await loadOffpageSection(db, userId, writerCampaign.id, 'weboff', date, today);
  }

  // Union of both task types' scheduled dates, so the date selector covers
  // whichever has tasks on a given day even if the schedules diverge.
  const allDatesMap = new Map();
  [...gbp.availableDates, ...weboff.availableDates].forEach(d => allDatesMap.set(d.task_date, d));
  const combinedAvailableDates = Array.from(allDatesMap.values()).sort((a, b) => a.task_date.localeCompare(b.task_date));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {!writerCampaign ? (
        <div className="card"><p style={{ color: 'var(--danger)', margin: 0 }}>No active writer campaign yet. Please contact your admin.</p></div>
      ) : (
        <WriterTasksClient
          gbpTasksByClient={gbp.tasksByClient}
          weboffTasksByClient={weboff.tasksByClient}
          gbpPendingByClient={gbp.pendingTasksByClient}
          weboffPendingByClient={weboff.pendingTasksByClient}
          availableDates={combinedAvailableDates}
          selectedDate={date}
          today={today}
        />
      )}
    </div>
  );
}
