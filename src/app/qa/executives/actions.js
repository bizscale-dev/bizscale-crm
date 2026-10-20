'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { createNotificationsForUsers, getReportsLinkForRole } from '@/lib/notifications';
import { notifyAdminOnGoogleChat } from '@/lib/googleChat';
import { QA_RESOLVE_DAYS, QA_SEVERITIES, QA_MAX_SCREENSHOT_BASE64 } from '@/lib/qaReports';

const MAX_CLIENTS = 10;
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

  const managerIds = [...new Set((Array.isArray(input?.managerIds) ? input.managerIds : []).map((id) => parseInt(id, 10)).filter(Boolean))];
  const clientInputs = [...new Set((Array.isArray(input?.clients) ? input.clients : []).map((c) => clean(c, 300).toLowerCase()).filter(Boolean))];
  const description = clean(input?.description, 3000);
  const location = clean(input?.location, 300);
  const issue = clean(input?.issue, 500);
  const department = clean(input?.department, 100);
  const severity = clean(input?.severity, 10).toLowerCase();
  const urlInput = clean(input?.url, 5000);
  const screenshot = input?.screenshot || null;

  if (managerIds.length === 0) return { error: 'Select at least one manager' };
  if (!description) return { error: 'Description is required' };
  if (!QA_SEVERITIES.includes(severity)) return { error: 'Pick a severity (high, medium or low)' };

  // One or many links (separated by newlines, spaces or commas) — stored one per line.
  const urls = [];
  for (const raw of urlInput.split(/[\s,]+/).filter(Boolean)) {
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      new URL(candidate);
    } catch {
      return { error: `"${raw.slice(0, 60)}" doesn’t look like a valid URL` };
    }
    urls.push(candidate);
  }
  const url = urls.join('\n');

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
  const idPlaceholders = managerIds.map(() => '?').join(',');
  const managers = await db.prepare(
    `SELECT id, role FROM users WHERE id IN (${idPlaceholders}) AND is_active = 1 AND role IN (${placeholders})`
  ).all(...managerIds, ...MANAGER_ROLES);
  if (managers.length !== managerIds.length) return { error: 'One of the selected managers was not found' };

  // The client must be one from the SEO roster (the list the form offers),
  // matched case-insensitively; the roster's own spelling is what's stored.
  // The client is optional; when given it must be on the roster.
  if (clientInputs.length > MAX_CLIENTS) return { error: `Pick at most ${MAX_CLIENTS} clients per report` };
  const clientNames = [];
  if (clientInputs.length > 0) {
    const roster = await db.prepare(
      "SELECT DISTINCT TRIM(name) as name FROM clients WHERE name IS NOT NULL AND TRIM(name) != ''"
    ).all();
    for (const wanted of clientInputs) {
      const match = roster.map((r) => r.name).find((n) => n.toLowerCase() === wanted);
      if (!match) return { error: 'Pick the clients from the list' };
      clientNames.push(match);
    }
  }
  // No client = one report with a blank client; otherwise one per client so
  // each shows up under its own client in Clients Stats.
  const clientTargets = clientNames.length > 0 ? clientNames : [''];

  const today = new Date().toISOString().split('T')[0];
  // One report per manager and client — each has its own deadline, resolution and follow-up.
  for (const manager of managers) {
  for (const clientName of clientTargets) {
  await db.prepare(`
    INSERT INTO qa_reports
      (qa_user_id, manager_id, eod_report_id, eod_entry_id, report_date, web_client_name, page_url, work_done, note,
       source, title, location, issue, department, severity, screenshot_base64)
    VALUES (?, ?, 0, 0, ?, ?, ?, NULL, ?, 'manual', NULL, ?, ?, ?, ?, ?)
  `).run(
    session.userId, manager.id, today, clientName, url || null, description,
    location || null, issue || null, department || null, severity, screenshot
  );
  }

  await createNotificationsForUsers(db, [manager.id], {
    title: `New ${severity} severity QA report`,
    message: `${clientNames.length ? `${clientNames.join(', ')}: ` : ''}${description.slice(0, 100)} — resolve within ${QA_RESOLVE_DAYS} working days`,
    link: getReportsLinkForRole(manager.role),
  });
  }

  revalidatePath('/qa/reports');

  // Optional: ping the admin in the Google Chat space. The report is already
  // filed, so a chat failure is reported back but doesn't undo anything.
  let chatError = null;
  if (input?.notifyAdmin) {
    const names = (await db.prepare(
      `SELECT name FROM users WHERE id IN (${idPlaceholders})`
    ).all(...managerIds)).map((m) => m.name);
    const filer = await db.prepare('SELECT name FROM users WHERE id = ?').get(session.userId);
    const lines = [
      `*New ${severity} severity QA report* (filed by ${filer?.name || 'QA'})`,
      `Manager${names.length === 1 ? '' : 's'}: ${names.join(', ')}`,
      clientNames.length > 0 && `Client${clientNames.length === 1 ? '' : 's'}: ${clientNames.join(', ')}`,
      `Description: ${description.slice(0, 500)}`,
      location && `Location: ${location}`,
      issue && `Issue: ${issue}`,
      url && `Links:\n${url}`,
    ].filter(Boolean);
    const chat = await notifyAdminOnGoogleChat(lines.join('\n'));
    if (!chat.ok) chatError = chat.error;
  }

  return { success: true, count: managers.length * clientTargets.length, chatError };
}
