import { SEO_SUPPORT_RANGES } from '@/lib/qaClientOwners';
import { createNotificationsForUsers, getTasksLinkForRole } from '@/lib/notifications';

// Checklist every newly fetched SEO client gets, assigned as default tasks to
// the SEO manager who owns the client (Support column: 1-5 M Hussain, 6-10
// Talha — see qaClientOwners.js).
export const ONBOARDING_TASKS = [
  'Keyword Research',
  'Current Keywords Ranking',
  'Initial Audit ( Find the issues)',
  'Demand For GMB Posting',
  'Business Description',
  'Service Areas',
  'Services Optimization',
  'Check if logo is uploaded To GMB',
  'Secondary Categories',
  'Audit Social media Accounts',
  'Attach Social media Accounts To GMB',
];

export const ONBOARDING_DUE_DAYS = 2;

// Due at the end of the second day after the client arrived (Pakistan time).
function dueDateInDays(days) {
  const pkt = new Date(Date.now() + 5 * 60 * 60 * 1000);
  pkt.setUTCDate(pkt.getUTCDate() + days);
  return pkt.toISOString().split('T')[0];
}

/**
 * Creates the onboarding checklist for one new client as a single manager task
 * (tagged is_default = 1, the items are tickable boxes), assigned to the owning
 * SEO manager. Does
 * nothing when the client has no Support number or its manager can't be found.
 * Returns the number of tasks created (0 or 1).
 */
export async function createClientOnboardingTasks(db, { clientName, supportNumber }) {
  const range = supportNumber == null
    ? null
    : SEO_SUPPORT_RANGES.find((r) => supportNumber >= r.from && supportNumber <= r.to);
  if (!range) return 0;

  const manager = await db.prepare(`
    SELECT id, role FROM users
    WHERE role = 'seo_manager' AND is_active = 1 AND lower(trim(name)) = ?
  `).get(range.managerName.toLowerCase());
  const admin = await db.prepare(`
    SELECT id FROM users WHERE role = 'admin' AND is_active = 1 ORDER BY id LIMIT 1
  `).get();
  if (!manager || !admin) return 0;

  const dueDate = dueDateInDays(ONBOARDING_DUE_DAYS);
  const result = await db.prepare(`
    INSERT INTO manager_tasks (task_text, due_date, due_time, created_by, urgency, is_default, checklist)
    VALUES (?, ?, '23:59', ?, 'moderate', 1, ?)
  `).run(`${clientName} — Onboarding checklist`, dueDate, admin.id, JSON.stringify(ONBOARDING_TASKS));
  await db.prepare(`
    INSERT INTO manager_task_assignees (task_id, user_id) VALUES (?, ?)
  `).run(result.lastInsertRowid, manager.id);

  await createNotificationsForUsers(db, [manager.id], {
    title: 'New Client Onboarding Task',
    message: `${clientName} — onboarding checklist (${ONBOARDING_TASKS.length} items) — due ${dueDate}`,
    link: getTasksLinkForRole(manager.role),
  });
  return 1;
}
