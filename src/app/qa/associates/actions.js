'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { createNotificationsForUsers, getReportsLinkForRole } from '@/lib/notifications';
import { getClientOwnership, clientsForManager } from '@/lib/qaClientOwners';
import { parseResolveDays, QA_SEVERITIES, QA_MAX_SCREENSHOT_BASE64 } from '@/lib/qaReports';

const MANAGER_ROLES = ['seo_manager', 'web_seo_manager', 'writers_manager', 'senior_seo_associate'];
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * QA files a report on one associate's work, from that associate's card on the QA SEO Associates /
 * Web SEO Associates page: the client and link (type + URL) it concerns and what is wrong. It goes
 * through the same qa_reports pipeline as the Executives reports, to the manager who owns that
 * client (SEO clients: QA_SEO_OWNER, web clients: their web SEO manager), with the associate named in
 * the report so the manager knows whose work to fix.
 */
export async function submitAssociateReport(input) {
  const session = await verifySession();
  if (!session || session.role !== 'qa') return { error: 'Not authorized' };

  const associateId = parseInt(input?.associateId, 10);
  const client = clean(input?.client, 300);
  const linkType = clean(input?.linkType, 40);
  const linkUrl = clean(input?.linkUrl, 2000);
  const description = clean(input?.description, 3000);
  const severity = clean(input?.severity, 10).toLowerCase();
  const date = clean(input?.date, 10);
  const screenshot = input?.screenshot || null;
  const resolveDays = parseResolveDays(input?.resolveDays);

  if (!associateId) return { error: 'Associate not found' };
  if (!client) return { error: 'Pick the client this is about' };
  if (!description) return { error: 'Describe what is wrong' };
  if (!QA_SEVERITIES.includes(severity)) return { error: 'Pick a severity (high, medium or low)' };
  if (screenshot) {
    if (typeof screenshot !== 'string' || !screenshot.startsWith('data:image/')) return { error: 'Screenshot looks invalid — try re-attaching it' };
    if (screenshot.length > QA_MAX_SCREENSHOT_BASE64) return { error: 'Screenshot is too large (max 2MB)' };
  }
  if (linkUrl) {
    try { new URL(/^https?:\/\//i.test(linkUrl) ? linkUrl : `https://${linkUrl}`); } catch { return { error: 'The link does not look like a valid URL' }; }
  }

  const db = await getDb();
  const associate = await db.prepare(
    "SELECT id, name, role FROM users WHERE id = ? AND is_active = 1 AND role IN ('seo_associate','senior_seo_associate','web_seo_associate')"
  ).get(associateId);
  if (!associate) return { error: 'Associate not found' };

  const placeholders = MANAGER_ROLES.map(() => '?').join(',');
  const managers = await db.prepare(`SELECT id, name, role FROM users WHERE role IN (${placeholders}) AND is_active = 1`).all(...MANAGER_ROLES);
  const { clientNames, owners } = await getClientOwnership(db, managers);
  const clientName = clientNames.find((n) => n.toLowerCase() === client.toLowerCase());
  if (!clientName) return { error: 'That client is not on the current roster' };

  const targets = managers.filter((m) => m.role !== 'writers_manager' && clientsForManager(m, [clientName], owners).length > 0);
  if (targets.length === 0) return { error: `No manager owns ${clientName}, so there is nobody to send this to.` };

  const isWeb = associate.role === 'web_seo_associate';
  const header = `Associate: ${associate.name}${date ? ` — work of ${date}` : ''}${linkType ? ` — ${linkType}` : ''}`;
  const note = `${header}\n${description}`;
  const issueGroup = crypto.randomUUID();
  const today = new Date().toISOString().split('T')[0];

  await db.batch(targets.map((manager) => ({
    sql: `
      INSERT INTO qa_reports
        (qa_user_id, manager_id, eod_report_id, eod_entry_id, report_date, web_client_name, page_url, work_done, note,
         source, title, location, issue, department, severity, screenshot_base64, client_names, issue_group, resolve_days)
      VALUES (?, ?, 0, 0, ?, ?, ?, NULL, ?, 'manual', NULL, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      session.userId, manager.id, today, clientName, linkUrl || null, note,
      linkType || null, `Work by ${associate.name}`, isWeb ? 'Web SEO Associate' : 'SEO Associate', severity, screenshot,
      clientName, issueGroup, resolveDays,
    ],
  })));

  for (const manager of targets) {
    await createNotificationsForUsers(db, [manager.id], {
      title: `New ${severity} severity QA report`,
      message: `${clientName} (${associate.name}): ${description.slice(0, 100)} — resolve within ${resolveDays} working day${resolveDays === 1 ? '' : 's'}`,
      link: getReportsLinkForRole(manager.role),
    });
  }

  revalidatePath('/qa/reports');
  return { success: true, sentTo: targets.map((m) => m.name), resolveDays };
}
