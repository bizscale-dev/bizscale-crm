import { getDb } from '@/lib/db';
import { getActiveCampaign, LINK_TYPE_LABELS } from '@/lib/services';
import { verifySession } from '@/lib/session';
import TasksClient from './TasksClient';

export const revalidate = 0; // Disable caching for real-time data

function groupByClient(tasks) {
  const byClient = {};
  tasks.forEach(t => {
    if (!byClient[t.client_id]) {
      byClient[t.client_id] = { client_id: t.client_id, client_name: t.client_name, website: t.website, tasks: [] };
    }
    byClient[t.client_id].tasks.push(t);
  });
  return Object.values(byClient);
}

export default async function AssociateTasksPage({ searchParams }) {
  const db = await getDb();
  const session = await verifySession();
  const userId = session.userId;
  const campaign = await getActiveCampaign();
  const today = new Date().toISOString().split('T')[0];
  const resolvedSearchParams = await searchParams;
  const date = resolvedSearchParams?.date || today;

  let tasks = [], availableDates = [], pendingTasks = [];

  if (campaign) {
    // Only show tasks for active clients
    tasks = await db.prepare(`
      SELECT st.*, c.name as client_name, c.website,
        (SELECT COUNT(*) FROM link_logs WHERE task_id = st.id) as log_count
      FROM seo_tasks st
      JOIN clients c ON c.id = st.client_id
      WHERE st.associate_id = ? AND st.campaign_id = ? AND st.task_date = ? AND c.is_active = 1
      ORDER BY c.sort_order, st.link_type
    `).all(userId, campaign.id, date);

    // Only show available dates for active clients
    availableDates = await db.prepare(`
      SELECT DISTINCT st.task_date, st.day_number
      FROM seo_tasks st
      JOIN clients c ON c.id = st.client_id
      WHERE st.associate_id = ? AND st.campaign_id = ? AND c.is_active = 1
      ORDER BY st.task_date
    `).all(userId, campaign.id);

    // Pending — the task's scheduled day has already passed (relative to today, not
    // whichever date is currently selected) but it's still not fully done.
    pendingTasks = await db.prepare(`
      SELECT st.*, c.name as client_name, c.website
      FROM seo_tasks st
      JOIN clients c ON c.id = st.client_id
      WHERE st.associate_id = ? AND st.campaign_id = ?
        AND st.task_date < ? AND st.completed_count < st.target_count AND c.is_active = 1
      ORDER BY st.task_date DESC, c.sort_order, st.link_type
    `).all(userId, campaign.id, today);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {!campaign ? (
        <div className="card"><p style={{ color: 'var(--danger)', margin: 0 }}>No active campaign. Please contact your admin.</p></div>
      ) : (
        <TasksClient
          tasksByClient={groupByClient(tasks)}
          pendingByClient={groupByClient(pendingTasks)}
          availableDates={availableDates}
          selectedDate={date}
          today={today}
          linkTypeLabels={LINK_TYPE_LABELS}
        />
      )}
    </div>
  );
}
