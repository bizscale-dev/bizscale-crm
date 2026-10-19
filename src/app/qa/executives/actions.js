'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { createNotificationsForUsers, getReportsLinkForRole } from '@/lib/notifications';
import { QA_RESOLVE_DAYS, QA_SEVERITIES, QA_MAX_SCREENSHOT_BASE64 } from '@/lib/qaReports';

const MANAGER_ROLES = ['seo_manager', 'web_seo_manager', 'writers_manager'];

async function requireQa() {
  const session = await verifySession();
  if (!session || session.role !== 'qa') {
    return { error: 'Not authorized' };
  }
  return { session };
}

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * QA files a report by hand against one manager (the Executives page) —
 * the client it concerns, description, location, url, issue, department, severity and an
 * optional screenshot. Lands in the same qa_reports pipeline as the EOD and
 * task reports, so the manager is notified, has QA_RESOLVE_DAYS to resolve
 * it, and their Reports tab blinks until then. Everything is re-validated
 * here; the manager must really be an active manager-role user.
 */
export async function submitExecutiveReport(input) {
  const { session, error } = await requireQa();
  if (error) return { error };

  const managerId = parseInt(input?.managerId, 10);
  const clientInput = clean(input?.client, 300);
  const description = clean(input?.description, 3000);
  const location = clean(input?.location, 300);
  const issue = clean(input?.issue, 500);
  const department = clean(input?.department, 100);
  const severity = clean(input?.severity, 10).toLowerCase();
  let url = clean(input?.url, 1000);
  const screenshot = input?.screenshot || null;

  if (!managerId) return { error: 'Select a manager' };
  if (!clientInput) return { error: 'Select the client this report is about' };
  if (!description) return { error: 'Description is required' };
  if (!QA_SEVERITIES.includes(severity)) return { error: 'Pick a severity (high, medium or low)' };

  if (url) {
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      new URL(url);
    } catch {
      return { error: 'That URL doesn’t look valid' };
    }
  }

  if (screenshot) {
    if (typeof screenshot !== 'string' || !screenshot.startsWith('data:image/')) {
      return { error: 'Screenshot looks invalid — try re-attaching it' };
    }
    if (screenshot.length > QA_MAX_SCREENSHOT_BASE64) {
      return { error: 'Screenshot is too large (max 2MB)' };
    }
  }

  const db = await getDb();
  const placeholders = MANAGER_ROLES.map(() => '?').join(',');
  const manager = await db.prepare(
    `SELECT id, role FROM users WHERE id = ? AND is_active = 1 AND role IN (${placeholders})`
  ).get(managerId, ...MANAGER_ROLES);
  if (!manager) return { error: 'Manager not found' };

  // The client must be one from the SEO roster (the list the form offers),
  // matched case-insensitively; the roster's own spelling is what's stored.
  const roster = await db.prepare(
    "SELECT DISTINCT TRIM(name) as name FROM clients WHERE name IS NOT NULL AND TRIM(name) != ''"
  ).all();
  const clientName = roster.map((r) => r.name).find((n) => n.toLowerCase() === clientInput.toLowerCase());
  if (!clientName) return { error: 'Pick a client from the list' };

  const today = new Date().toISOString().split('T')[0];
  await db.prepare(`
    INSERT INTO qa_reports
      (qa_user_id, manager_id, eod_report_id, eod_entry_id, report_date, web_client_name, page_url, work_done, note,
       source, title, location, issue, department, severity, screenshot_base64)
    VALUES (?, ?, 0, 0, ?, ?, ?, NULL, ?, 'manual', NULL, ?, ?, ?, ?, ?)
  `).run(
    session.userId, manager.id, today, clientName, url || null, description,
    location || null, issue || null, department || null, severity, screenshot
  );

  await createNotificationsForUsers(db, [manager.id], {
    title: `New ${severity} severity QA report`,
    message: `${clientName}: ${description.slice(0, 100)} — resolve within ${QA_RESOLVE_DAYS} days`,
    link: getReportsLinkForRole(manager.role),
  });

  revalidatePath('/qa/reports');
  return { success: true };
}
