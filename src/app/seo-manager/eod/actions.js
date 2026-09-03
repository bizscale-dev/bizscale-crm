'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { getSitePages } from '@/lib/sitemapFetch';

async function requireSeoManager() {
  const session = await verifySession();
  if (!session || session.role !== 'seo_manager') {
    return { error: 'Not authorized' };
  }
  return { session };
}

/**
 * Fetches the page list for an SEO client's site, for the EOD report page-picker
 * step. See src/lib/sitemapFetch.js for the actual fetch/extraction logic — this
 * just adds the auth guard and resolves the client's stored website URL.
 */
export async function getWebClientPages(clientId) {
  const { error } = await requireSeoManager();
  if (error) return { error };

  const id = parseInt(clientId, 10);
  if (!id || Number.isNaN(id)) {
    return { error: 'Invalid client' };
  }

  const db = await getDb();
  const client = await db.prepare('SELECT id, website FROM clients WHERE id = ?').get(id);
  if (!client) {
    return { error: 'Client not found' };
  }

  return getSitePages(client.website);
}

/**
 * Submit an end-of-day report for the signed-in SEO Manager. Same shape as the
 * Web SEO Manager's version (src/app/web-seo-manager/eod/actions.js) — entries
 * staged client-side, written here in one go. There's at most one report row per
 * (manager, date) — enforced by the UNIQUE on eod_reports — so submitting again
 * later the same day appends the new entries onto that day's existing report
 * instead of creating a duplicate.
 */
export async function submitEodReport(entries) {
  const { session, error: authError } = await requireSeoManager();
  if (authError) return { error: authError };

  if (!Array.isArray(entries) || entries.length === 0) {
    return { error: 'Add at least one entry before submitting' };
  }

  try {
    const db = await getDb();

    const cleaned = [];
    for (const entry of entries) {
      const clientId = parseInt(entry?.webClientId, 10) || 0;
      const pageUrl = (entry?.pageUrl || '').trim();
      const workDone = (entry?.workDone || '').trim();
      const description = (entry?.description || '').trim();

      if (!workDone) {
        return { error: 'Every entry needs the work done filled in' };
      }

      let clientName;
      if (clientId === 0) {
        // No real clients row — a manually typed heading instead. There's nothing
        // to resolve server-side, so trust what the manager typed (still required).
        clientName = (entry?.webClientName || '').trim();
        if (!clientName) {
          return { error: 'Every entry needs a client or a heading' };
        }
      } else {
        // Resolve the name server-side rather than trusting what the browser sent, since
        // it's stored permanently on the entry row.
        const client = await db.prepare('SELECT id, name FROM clients WHERE id = ?').get(clientId);
        if (!client) {
          return { error: 'One of the selected clients no longer exists' };
        }
        clientName = client.name;
      }

      cleaned.push({
        clientId,
        clientName,
        pageUrl: pageUrl || null,
        workDone,
        description: description || null,
      });
    }

    const reportDate = new Date().toISOString().split('T')[0];

    // Atomic upsert instead of select-then-insert — avoids the race condition where
    // two near-simultaneous submits could both see "no report yet" and both try to
    // INSERT, hitting the UNIQUE (user_id, report_date) constraint unhandled.
    await db.prepare(`
      INSERT INTO eod_reports (user_id, report_date) VALUES (?, ?)
      ON CONFLICT(user_id, report_date) DO NOTHING
    `).run(session.userId, reportDate);
    const report = await db.prepare(
      'SELECT id FROM eod_reports WHERE user_id = ? AND report_date = ?'
    ).get(session.userId, reportDate);

    // web_client_id/web_client_name columns are shared across every manager type —
    // just a denormalized (id, name) snapshot with no FK to a specific clients
    // table, so an SEO Manager's entries reuse the same eod_report_entries schema
    // as Web SEO Managers.
    const insertSql = `
      INSERT INTO eod_report_entries (report_id, web_client_id, web_client_name, page_url, work_done, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    await db.batch(cleaned.map(e => ({
      sql: insertSql,
      args: [report.id, e.clientId, e.clientName, e.pageUrl, e.workDone, e.description],
    })));

    revalidatePath('/seo-manager/eod');

    return { success: true, reportDate, entriesAdded: cleaned.length };
  } catch (err) {
    console.error('[EOD] submitEodReport failed:', err);
    return { error: err.message || 'Failed to submit report — please try again.' };
  }
}
