'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { createNotificationsForUsers, getReportsLinkForRole } from '@/lib/notifications';
import { getClientOwnership, clientsForManager } from '@/lib/qaClientOwners';
import { parseResolveDays, QA_SEVERITIES, QA_MAX_SCREENSHOT_BASE64 } from '@/lib/qaReports';

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
  const resolveDays = parseResolveDays(input?.resolveDays);

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
    `SELECT id, name, role FROM users WHERE id IN (${idPlaceholders}) AND is_active = 1 AND role IN (${placeholders})`
  ).all(...managerIds, ...MANAGER_ROLES);
  if (managers.length !== managerIds.length) return { error: 'One of the selected managers was not found' };

  // Clients are optional; each must be on the roster (SEO + web clients),
  // matched case-insensitively — the roster's own spelling is what's stored.
  const allManagers = await db.prepare(
    `SELECT id, name, role FROM users WHERE role IN (${placeholders}) AND is_active = 1`
  ).all(...MANAGER_ROLES);
  const { clientNames: roster, owners } = await getClientOwnership(db, allManagers);
  const clientNames = [];
  for (const wanted of clientInputs) {
    const match = roster.find((n) => n.toLowerCase() === wanted);
    if (!match) return { error: 'Pick the clients from the list' };
    clientNames.push(match);
  }

  // Each manager only gets the clients they actually own (writers managers own all).
  // With no clients chosen the issue goes to every selected manager as before.
  const targets = [];
  const skipped = [];
  for (const manager of managers) {
    const mine = clientNames.length > 0 ? clientsForManager(manager, clientNames, owners) : [];
    if (clientNames.length > 0 && mine.length === 0) skipped.push(manager.name);
    else targets.push({ manager, clients: mine });
  }
  if (targets.length === 0) {
    return { error: 'None of the selected managers own any of the selected clients.' };
  }

  // One report per manager, however many clients it covers. The managers' rows
  // from one submission share an issue_group so Clients Stats counts the issue
  // once per client (50 clients = 50 issues, not 50 x managers).
  const issueGroup = crypto.randomUUID();
  const today = new Date().toISOString().split('T')[0];
  const insertSql = `
    INSERT INTO qa_reports
      (qa_user_id, manager_id, eod_report_id, eod_entry_id, report_date, web_client_name, page_url, work_done, note,
       source, title, location, issue, department, severity, screenshot_base64, client_names, issue_group, resolve_days)
    VALUES (?, ?, 0, 0, ?, ?, ?, NULL, ?, 'manual', NULL, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  await db.batch(targets.map(({ manager, clients }) => ({
    sql: insertSql,
    args: [
      session.userId, manager.id, today, clients.length > 1 ? `${clients.length} clients` : (clients[0] || ''),
      url || null, description, location || null, issue || null, department || null, severity, screenshot,
      clients.length ? clients.join('\n') : null, issueGroup, resolveDays,
    ],
  })));

  for (const { manager, clients } of targets) {
    await createNotificationsForUsers(db, [manager.id], {
      title: `New ${severity} severity QA report`,
      message: clients.length > 1
        ? `1 issue across ${clients.length} clients: ${description.slice(0, 100)} \u2014 resolve within ${resolveDays} working day${resolveDays === 1 ? '' : 's'}`
        : `${clients[0] ? `${clients[0]}: ` : ''}${description.slice(0, 100)} \u2014 resolve within ${resolveDays} working day${resolveDays === 1 ? '' : 's'}`,
      link: getReportsLinkForRole(manager.role),
    });
  }

  revalidatePath('/qa/reports');

  return {
    success: true,
    count: targets.length,
    resolveDays,
    perManager: targets.map(({ manager, clients }) => ({ name: manager.name, clients: clients.length })),
    skipped,
  };
}
