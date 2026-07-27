import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import { verifySession } from '@/lib/session';
import WriterTasksClient from './WriterTasksClient';

export const revalidate = 0; // Disable caching for real-time data

export default async function WriterTasksPage({ searchParams }) {
  const db = await getDb();
  const session = await verifySession();
  const userId = session.userId;
  const campaign = await getActiveCampaign();
  const today = new Date().toISOString().split('T')[0];
  const date = searchParams?.date || today;

  let tasks = [], availableDates = [];
  let webTasks = [], webAvailableDates = [];

  if (campaign) {
    // Only show tasks for active clients assigned to this writer
    tasks = await db.prepare(`
      SELECT wt.*, c.name as client_name, c.website
      FROM writing_tasks wt
      JOIN clients c ON c.id = wt.client_id
      WHERE wt.writer_id = ? AND wt.campaign_id = ? AND wt.task_date = ? AND c.is_active = 1
      ORDER BY c.sort_order, wt.post_type
    `).all(userId, campaign.id, date);

    // Only show available dates for active clients
    availableDates = await db.prepare(`
      SELECT DISTINCT wt.task_date, wt.day_number
      FROM writing_tasks wt
      JOIN clients c ON c.id = wt.client_id
      WHERE wt.writer_id = ? AND wt.campaign_id = ? AND c.is_active = 1
      ORDER BY wt.task_date
    `).all(userId, campaign.id);

    // Web Tasks — mirrors this writer's assigned Web SEO Associate's schedule (see
    // web_writing_tasks generation in webSeoTaskGenerator.js). Shown as a separate
    // section on this same page rather than its own nav tab.
    webTasks = await db.prepare(`
      SELECT wwt.*, wc.name as client_name, wc.business_name
      FROM web_writing_tasks wwt
      JOIN web_clients wc ON wc.id = wwt.client_id
      WHERE wwt.writer_id = ? AND wwt.campaign_id = ? AND wwt.task_date = ? AND wc.is_active = 1
      ORDER BY wc.business_name, wwt.post_type
    `).all(userId, campaign.id, date);

    webAvailableDates = await db.prepare(`
      SELECT DISTINCT wwt.task_date, wwt.day_number
      FROM web_writing_tasks wwt
      JOIN web_clients wc ON wc.id = wwt.client_id
      WHERE wwt.writer_id = ? AND wwt.campaign_id = ? AND wc.is_active = 1
      ORDER BY wwt.task_date
    `).all(userId, campaign.id);
  }

  // Fetch each task's own logged posts so the writer can see/delete what they've logged
  const logsByTask = {};
  if (tasks.length > 0) {
    const taskIds = tasks.map(t => t.id);
    const placeholders = taskIds.map(() => '?').join(',');
    const logs = await db.prepare(`
      SELECT * FROM writing_logs WHERE task_id IN (${placeholders}) ORDER BY created_at DESC
    `).all(...taskIds);
    logs.forEach(log => {
      if (!logsByTask[log.task_id]) logsByTask[log.task_id] = [];
      logsByTask[log.task_id].push(log);
    });
  }

  const webLogsByTask = {};
  if (webTasks.length > 0) {
    const webTaskIds = webTasks.map(t => t.id);
    const placeholders = webTaskIds.map(() => '?').join(',');
    const webLogs = await db.prepare(`
      SELECT * FROM web_writing_logs WHERE task_id IN (${placeholders}) ORDER BY created_at DESC
    `).all(...webTaskIds);
    webLogs.forEach(log => {
      if (!webLogsByTask[log.task_id]) webLogsByTask[log.task_id] = [];
      webLogsByTask[log.task_id].push(log);
    });
  }

  // Group tasks by client, keeping every task (one per post type) instead of collapsing them
  const tasksByClient = {};
  tasks.forEach(t => {
    if (!tasksByClient[t.client_id]) {
      tasksByClient[t.client_id] = {
        client_id: t.client_id,
        client_name: t.client_name,
        website: t.website,
        tasks: [],
      };
    }
    tasksByClient[t.client_id].tasks.push({ ...t, logs: logsByTask[t.id] || [] });
  });

  const webTasksByClient = {};
  webTasks.forEach(t => {
    if (!webTasksByClient[t.client_id]) {
      webTasksByClient[t.client_id] = {
        client_id: t.client_id,
        client_name: t.business_name || t.client_name,
        tasks: [],
      };
    }
    webTasksByClient[t.client_id].tasks.push({ ...t, logs: webLogsByTask[t.id] || [] });
  });

  // Union of both task types' scheduled dates, so the date selector covers whichever
  // has tasks on a given day even if the writer's regular and web schedules diverge.
  const allDatesMap = new Map();
  [...availableDates, ...webAvailableDates].forEach(d => allDatesMap.set(d.task_date, d));
  const combinedAvailableDates = Array.from(allDatesMap.values()).sort((a, b) => a.task_date.localeCompare(b.task_date));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {!campaign ? (
        <div className="card"><p style={{ color: 'var(--danger)', margin: 0 }}>No active campaign. Please contact your admin.</p></div>
      ) : (
        <WriterTasksClient
          tasksByClient={Object.values(tasksByClient)}
          webTasksByClient={Object.values(webTasksByClient)}
          availableDates={combinedAvailableDates}
          selectedDate={date}
          today={today}
        />
      )}
    </div>
  );
}
