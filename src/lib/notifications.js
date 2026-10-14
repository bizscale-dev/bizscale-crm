// Where a recipient's Tasks page lives, by role — the single source of
// truth for every notification's `link`, used by both assignment tiers
// (admin -> manager, manager -> associate).
const TASKS_LINK_BY_ROLE = {
  seo_manager: '/seo-manager/tasks',
  web_seo_manager: '/web-seo-manager/tasks',
  writers_manager: '/writers-manager/tasks',
  seo_associate: '/associate/manager-tasks',
  web_seo_associate: '/web-associate/manager-tasks',
  writer: '/writer/manager-tasks',
};

export function getTasksLinkForRole(role) {
  return TASKS_LINK_BY_ROLE[role] || '/';
}

/**
 * Bulk-inserts one notification row per recipient — called right after a
 * task's assignee rows are created (one-off assignment or a recurring
 * template's spawned occurrence), never from client code. Takes the
 * caller's already-open `db` handle rather than opening its own.
 */
export async function createNotificationsForUsers(db, userIds, { title, message, link }) {
  for (const userId of userIds) {
    await db.prepare(`
      INSERT INTO notifications (user_id, title, message, link) VALUES (?, ?, ?, ?)
    `).run(userId, title, message, link);
  }
}
