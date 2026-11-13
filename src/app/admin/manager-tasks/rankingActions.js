'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { createNotificationsForUsers, getTasksLinkForRole } from '@/lib/notifications';
import { getActiveWebSeoCampaign } from '@/lib/services';
import { pakistanDate } from '@/lib/qaAssociateWork';

const MAX_DATES = 12;
const DUE_TIME = '23:59';

async function requireAdmin() {
  const session = await verifySession();
  return session && session.role === 'admin' ? session : null;
}

const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const weekdayOf = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = Sunday, 6 = Saturday
const dateLabel = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// SEO / Senior SEO associates of the active campaign, each with only the clients they have SEO tasks for.
async function seoPeople(db) {
  const campaign = await db.prepare(`
    SELECT COALESCE(
      (SELECT id FROM campaigns WHERE status = 'active' ORDER BY id DESC LIMIT 1),
      (SELECT id FROM campaigns ORDER BY id DESC LIMIT 1)) AS id
  `).get();
  if (!campaign?.id) return [];
  const people = await db.prepare(`
    SELECT u.id, u.name FROM users u JOIN associate_assignments a ON a.user_id = u.id AND a.campaign_id = ?
    WHERE u.is_active = 1 AND u.role IN ('seo_associate', 'senior_seo_associate')
  `).all(campaign.id);
  const out = [];
  for (const p of people) {
    const clients = await db.prepare(`
      SELECT TRIM(c.name) AS name FROM clients c
      WHERE c.campaign_id = ? AND c.is_active = 1
        AND c.id IN (SELECT DISTINCT client_id FROM seo_tasks WHERE campaign_id = ? AND associate_id = ?)
      ORDER BY c.sort_order, c.id
    `).all(campaign.id, campaign.id, p.id);
    out.push({ id: p.id, name: p.name, link: getTasksLinkForRole('seo_associate'), clients: clients.map((c) => c.name) });
  }
  return out;
}

// Web SEO associates, each with only the active web clients assigned to them in the active Web SEO campaign.
async function webPeople(db) {
  const campaign = await getActiveWebSeoCampaign();
  if (!campaign) return [];
  const people = await db.prepare("SELECT id, name FROM users WHERE role = 'web_seo_associate' AND is_active = 1").all();
  const out = [];
  for (const p of people) {
    const clients = await db.prepare(`
      SELECT TRIM(name) AS name FROM web_clients
      WHERE webseo_campaign_id = ? AND assigned_associate_id = ? AND is_active = 1 ORDER BY id
    `).all(campaign.id, p.id);
    out.push({ id: p.id, name: p.name, link: getTasksLinkForRole('web_seo_associate'), clients: clients.map((c) => c.name) });
  }
  return out;
}

/**
 * Admin creates "ranking check" tasks. One task per deadline date (weekdays only). Each selected associate gets the task
 * with a checkbox for each of THEIR OWN clients only; the task is done when every box is ticked (see applyClientCheck).
 * audiences: 'seo' (SEO + Senior SEO associates) and / or 'web' (Web SEO associates).
 */
export async function createRankingCheckTasks({ title, dates, audiences }) {
  const session = await requireAdmin();
  if (!session) return { error: 'Not authorized' };

  const name = (typeof title === 'string' ? title.trim() : '') || 'Ranking check';
  if (name.length > 120) return { error: 'The task name is too long (max 120 characters)' };
  const list = [...new Set((Array.isArray(dates) ? dates : []).filter(isIsoDate))].sort();
  const who = [...new Set((Array.isArray(audiences) ? audiences : []).filter((a) => a === 'seo' || a === 'web'))];

  if (list.length === 0) return { error: 'Add at least one deadline date' };
  if (list.length > MAX_DATES) return { error: `Too many dates (max ${MAX_DATES} at once)` };
  if (who.length === 0) return { error: 'Choose who gets it: SEO associates, Web SEO associates, or both' };

  const weekend = list.filter((d) => [0, 6].includes(weekdayOf(d)));
  if (weekend.length > 0) return { error: `${weekend.map(dateLabel).join(', ')} — a deadline can't be on a Saturday or Sunday` };
  const today = pakistanDate(0);
  const past = list.filter((d) => d < today);
  if (past.length > 0) return { error: `${past.map(dateLabel).join(', ')} — that date has already passed` };

  try {
    const db = await getDb();
    const people = [
      ...(who.includes('seo') ? await seoPeople(db) : []),
      ...(who.includes('web') ? await webPeople(db) : []),
    ];
    const withClients = people.filter((p) => p.clients.length > 0);
    const noClients = people.filter((p) => p.clients.length === 0).map((p) => p.name);
    if (withClients.length === 0) return { error: 'None of the selected associates have any clients assigned right now' };

    // The same name + deadline can't be created twice (the double-click / re-submit case).
    const dupes = [];
    for (const d of list) {
      const hit = await db.prepare("SELECT id FROM associate_tasks WHERE kind = 'monthly_clients' AND due_date = ? AND task_text LIKE ?").get(d, `${name} — %`);
      if (hit) dupes.push(d);
    }
    if (dupes.length > 0) return { error: `"${name}" already exists for ${dupes.map(dateLabel).join(', ')}. Delete it first or pick other dates.` };

    const create = db.transaction(async (tx) => {
      for (const d of list) {
        const text = `${name} — check the rankings of all your assigned clients and tick each client once it is checked. The task is done when every client is ticked. Deadline: ${dateLabel(d)}.`;
        const r = await tx.prepare(`
          INSERT INTO associate_tasks (task_text, due_date, due_time, created_by, urgency, kind) VALUES (?, ?, ?, ?, 'moderate', 'monthly_clients')
        `).run(text, d, DUE_TIME, session.userId);
        for (const p of withClients) {
          await tx.prepare('INSERT INTO associate_task_assignees (task_id, user_id, checklist) VALUES (?, ?, ?)')
            .run(r.lastInsertRowid, p.id, JSON.stringify(p.clients));
        }
      }
    });
    await create();

    const message = `${list.length} task${list.length === 1 ? '' : 's'}: ${name} — first deadline ${list[0]}`;
    for (const link of new Set(withClients.map((p) => p.link))) {
      await createNotificationsForUsers(db, withClients.filter((p) => p.link === link).map((p) => p.id), { title: 'New Task from Admin', message, link });
    }

    revalidatePath('/admin/manager-tasks');
    return { success: true, taskCount: list.length, assignedCount: withClients.length, noClients };
  } catch (err) {
    console.error('[Admin] createRankingCheckTasks failed:', err);
    return { error: err.message || 'Failed to create the tasks — please try again.' };
  }
}

/** Removes one ranking check task (and every associate's ticks on it). */
export async function deleteRankingCheckTask(taskId) {
  const session = await requireAdmin();
  if (!session) return { error: 'Not authorized' };
  const id = parseInt(taskId, 10);
  if (!id) return { error: 'Invalid task' };
  try {
    const db = await getDb();
    const task = await db.prepare("SELECT id FROM associate_tasks WHERE id = ? AND kind = 'monthly_clients'").get(id);
    if (!task) return { error: 'Task not found' };
    await db.prepare('DELETE FROM associate_task_assignees WHERE task_id = ?').run(id);
    await db.prepare('DELETE FROM associate_tasks WHERE id = ?').run(id);
    revalidatePath('/admin/manager-tasks');
    return { success: true };
  } catch (err) {
    console.error('[Admin] deleteRankingCheckTask failed:', err);
    return { error: err.message || 'Could not delete — please try again.' };
  }
}
