'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { createNotificationsForUsers, getReportsLinkForRole } from '@/lib/notifications';
import { parseResolveDays, QA_SEVERITIES } from '@/lib/qaReports';

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const KINDS = ['seo', 'web'];
const TYPE_LABELS = { web2: 'Web 2.0', guestpost: 'Guest Post', pdf: 'PDF', profile: 'Profile', citation: 'Citation', image: 'Image' };

async function requireQa() {
  const session = await verifySession();
  return session && session.role === 'qa' ? session : null;
}

/**
 * QA marks one link Pass or Fail (status '' clears the mark). Stored per client + URL, so the mark
 * stays on the link whichever day it is viewed from.
 */
export async function setLinkStatus({ kind, clientId, url, status }) {
  const session = await requireQa();
  if (!session) return { error: 'Not authorized' };
  const cid = parseInt(clientId, 10);
  const link = clean(url, 2000);
  if (!KINDS.includes(kind) || !cid || !link) return { error: 'Invalid link' };
  if (!['pass', 'fail', ''].includes(status)) return { error: 'Invalid status' };

  const db = await getDb();
  if (status === '') {
    await db.prepare('DELETE FROM qa_link_checks WHERE kind = ? AND client_id = ? AND url = ?').run(kind, cid, link);
  } else {
    await db.prepare(`
      INSERT INTO qa_link_checks (kind, client_id, url, status, checked_by) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(kind, client_id, url) DO UPDATE SET status = excluded.status, checked_by = excluded.checked_by, checked_at = CURRENT_TIMESTAMP
    `).run(kind, cid, link, status, session.userId);
  }
  return { success: true };
}

/** "Pass all" for one client: marks every given link Pass, except the ones already marked Fail. */
export async function setLinksPass({ kind, clientId, urls }) {
  const session = await requireQa();
  if (!session) return { error: 'Not authorized' };
  const cid = parseInt(clientId, 10);
  const list = Array.isArray(urls) ? [...new Set(urls.map((u) => clean(u, 2000)).filter(Boolean))].slice(0, 500) : [];
  if (!KINDS.includes(kind) || !cid || list.length === 0) return { error: 'Invalid links' };
  const db = await getDb();
  await db.batch(list.map((url) => ({
    sql: `
      INSERT INTO qa_link_checks (kind, client_id, url, status, checked_by) VALUES (?, ?, ?, 'pass', ?)
      ON CONFLICT(kind, client_id, url) DO NOTHING
    `,
    args: [kind, cid, url, session.userId],
  })));
  return { success: true };
}

/**
 * QA reports one link straight from the associates page — no client / link picking. The client,
 * link type and URL come from the row it was clicked on; only an optional comment (and a severity,
 * default medium) is typed.
 *
 *  - The report goes through the same qa_reports pipeline as every other QA report (resolve deadline,
 *    QA's Reports page, Resolved), but ONLY to the associate who did the link: they are the report's
 *    owner (manager_id = associate), fix it on their own Reports page and send it back to QA. No manager
 *    gets it. associate_id tags it for the per-associate stats.
 *  - The associate is notified with the client name and the link.
 *  - Reporting also marks the link Fail.
 */
export async function submitLinkReport(input) {
  const session = await requireQa();
  if (!session) return { error: 'Not authorized' };

  const kind = input?.kind;
  const associateId = parseInt(input?.associateId, 10);
  const clientId = parseInt(input?.clientId, 10);
  const linkType = clean(input?.linkType, 40);
  const linkUrl = clean(input?.linkUrl, 2000);
  const comment = clean(input?.comment, 3000); // optional
  const severity = clean(input?.severity, 10).toLowerCase() || 'medium';
  const date = clean(input?.date, 10);
  const resolveDays = parseResolveDays(input?.resolveDays);

  if (!KINDS.includes(kind) || !associateId || !clientId) return { error: 'Invalid report' };
  if (!QA_SEVERITIES.includes(severity)) return { error: 'Pick a severity (high, medium or low)' };

  const db = await getDb();
  const isWeb = kind === 'web';
  const associate = await db.prepare(
    isWeb
      ? "SELECT id, name, role FROM users WHERE id = ? AND is_active = 1 AND role = 'web_seo_associate'"
      : "SELECT id, name, role FROM users WHERE id = ? AND is_active = 1 AND role IN ('seo_associate','senior_seo_associate')"
  ).get(associateId);
  if (!associate) return { error: 'Associate not found' };

  const clientRow = await db.prepare(isWeb ? 'SELECT TRIM(name) AS name FROM web_clients WHERE id = ?' : 'SELECT TRIM(name) AS name FROM clients WHERE id = ?').get(clientId);
  if (!clientRow?.name) return { error: 'Client not found' };

  const clientName = clientRow.name;
  const targets = [associate];

  const typeLabel = TYPE_LABELS[linkType] || linkType || 'Link';
  const note = [
    `Link issue — ${clientName}`,
    `${typeLabel}${linkUrl ? `: ${linkUrl}` : ' (no link recorded)'}`,
    `Associate: ${associate.name}${date ? ` · work of ${date}` : ''}`,
    comment ? `\nQA comment: ${comment}` : '',
  ].filter(Boolean).join('\n');

  const issueGroup = crypto.randomUUID();
  const today = new Date().toISOString().split('T')[0];
  await db.batch(targets.map((manager) => ({
    sql: `
      INSERT INTO qa_reports
        (qa_user_id, manager_id, eod_report_id, eod_entry_id, report_date, web_client_name, page_url, work_done, note,
         source, title, location, issue, department, severity, screenshot_base64, client_names, issue_group, resolve_days, associate_id)
      VALUES (?, ?, 0, 0, ?, ?, ?, NULL, ?, 'manual', NULL, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
    `,
    args: [
      session.userId, manager.id, today, clientName, linkUrl || null, note,
      typeLabel, `Work by ${associate.name}`, isWeb ? 'Web SEO Associate' : 'SEO Associate', severity,
      clientName, issueGroup, resolveDays, associate.id,
    ],
  })));

  // The associate (the only recipient): exactly which client and link.
  await createNotificationsForUsers(db, [associate.id], {
    title: 'QA flagged one of your links',
    message: `${clientName} — ${typeLabel}${linkUrl ? `: ${linkUrl}` : ''}${comment ? ` — "${comment.slice(0, 120)}"` : ''}`,
    link: getReportsLinkForRole(associate.role),
  });

  if (linkUrl) {
    await db.prepare(`
      INSERT INTO qa_link_checks (kind, client_id, url, status, checked_by) VALUES (?, ?, ?, 'fail', ?)
      ON CONFLICT(kind, client_id, url) DO UPDATE SET status = 'fail', checked_by = excluded.checked_by, checked_at = CURRENT_TIMESTAMP
    `).run(kind, clientId, linkUrl, session.userId);
  }

  // No revalidatePath here: it would refresh the page QA is working on and drop them out of the open card.
  // QA's Reports page is always rendered fresh anyway (revalidate = 0).
  return { success: true, sentTo: targets.map((m) => m.name), associate: associate.name, resolveDays };
}
