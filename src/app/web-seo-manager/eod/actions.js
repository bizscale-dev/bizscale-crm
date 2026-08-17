'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { getSitePages } from '@/lib/sitemapFetch';

async function requireWebSeoManager() {
  const session = await verifySession();
  if (!session || session.role !== 'web_seo_manager') {
    return { error: 'Not authorized' };
  }
  return { session };
}

/**
 * Fetches the page list for a web client's site, for the EOD report page-picker step.
 * See src/lib/sitemapFetch.js for the actual fetch/extraction logic — this just adds
 * the auth guard and resolves the client's stored website URL.
 */
export async function getWebClientPages(webClientId) {
  const { error } = await requireWebSeoManager();
  if (error) return { error };

  const id = parseInt(webClientId, 10);
  if (!id || Number.isNaN(id)) {
    return { error: 'Invalid web client' };
  }

  const db = await getDb();
  const client = await db.prepare('SELECT id, website FROM web_clients WHERE id = ?').get(id);
  if (!client) {
    return { error: 'Web client not found' };
  }

  return getSitePages(client.website);
}

/**
 * Submit an end-of-day report for the signed-in Web SEO Manager.
 *
 * Entries are staged client-side as the manager adds them, then written here in one
 * go. There's at most one report row per (manager, date) — enforced by the UNIQUE on
 * eod_reports — so submitting again later the same day appends the new entries onto
 * that day's existing report instead of creating a second one.
 *
 * The report date is always today, computed server-side; the manager doesn't choose it.
 */
export async function submitEodReport(entries) {
  const { session, error: authError } = await requireWebSeoManager();
  if (authError) return { error: authError };

  if (!Array.isArray(entries) || entries.length === 0) {
    return { error: 'Add at least one entry before submitting' };
  }

  const db = await getDb();

  const cleaned = [];
  for (const entry of entries) {
    const webClientId = parseInt(entry?.webClientId, 10);
    const pageUrl = (entry?.pageUrl || '').trim();
    const workDone = (entry?.workDone || '').trim();
    const description = (entry?.description || '').trim();

    if (!webClientId || Number.isNaN(webClientId)) {
      return { error: 'Every entry needs a web client' };
    }
    if (!pageUrl) {
      return { error: 'Every entry needs a page selected' };
    }
    if (!workDone) {
      return { error: 'Every entry needs the work done filled in' };
    }

    // Resolve the name server-side rather than trusting what the browser sent, since
    // it's stored permanently on the entry row.
    const client = await db.prepare('SELECT id, business_name, name FROM web_clients WHERE id = ?').get(webClientId);
    if (!client) {
      return { error: 'One of the selected web clients no longer exists' };
    }

    cleaned.push({
      webClientId,
      webClientName: client.business_name || client.name,
      pageUrl,
      workDone,
      description: description || null,
    });
  }

  const reportDate = new Date().toISOString().split('T')[0];

  let report = await db.prepare(
    'SELECT id FROM eod_reports WHERE user_id = ? AND report_date = ?'
  ).get(session.userId, reportDate);

  if (!report) {
    await db.prepare('INSERT INTO eod_reports (user_id, report_date) VALUES (?, ?)')
      .run(session.userId, reportDate);
    report = await db.prepare(
      'SELECT id FROM eod_reports WHERE user_id = ? AND report_date = ?'
    ).get(session.userId, reportDate);
  }

  const insertSql = `
    INSERT INTO eod_report_entries (report_id, web_client_id, web_client_name, page_url, work_done, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  await db.batch(cleaned.map(e => ({
    sql: insertSql,
    args: [report.id, e.webClientId, e.webClientName, e.pageUrl, e.workDone, e.description],
  })));

  revalidatePath('/web-seo-manager/eod');

  return { success: true, reportDate, entriesAdded: cleaned.length };
}
