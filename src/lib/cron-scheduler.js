import { getDb } from './db';

// On Vercel, server-to-server calls can't target localhost — use the deployment's own
// URL. Vercel sets VERCEL_URL automatically (host only, no protocol); NEXT_PUBLIC_APP_URL
// is the explicit override for custom domains; localhost is the local-dev fallback.
function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

/**
 * Execute the sync job for all active campaigns. Invoked by the /api/cron/daily-sync
 * route, which Vercel Cron calls on schedule (see vercel.json) — this file no longer
 * self-schedules, since a serverless function can't keep an in-process timer alive.
 */
export async function runSyncJob() {
  try {
    const db = await getDb();
    const baseUrl = getBaseUrl();

    // Get all active campaigns
    const campaigns = await db.prepare("SELECT id, name FROM campaigns WHERE status = 'active'").all();

    if (campaigns.length === 0) {
      console.log('[CRON] No active campaigns, skipping sync');
      return;
    }

    console.log(`[CRON] Found ${campaigns.length} active campaign(s), syncing each one...`);

    // Get saved sheet URL from settings (single sheet for all campaigns)
    const settings = await db.prepare("SELECT value FROM settings WHERE key = 'google_sheets_url'").get();

    if (!settings) {
      console.log('[CRON] No Google Sheets URL configured, skipping sync');
      return;
    }

    const sheetUrl = settings.value;
    console.log('[CRON] Syncing from sheet:', sheetUrl);

    // Sync for each campaign
    for (const campaign of campaigns) {
      try {
        console.log(`[CRON] Syncing campaign: ${campaign.name}`);

        // Call sync-clients endpoint
        const syncResponse = await fetch(`${baseUrl}/api/google-sheets/sync-clients`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sheetUrl, campaignId: campaign.id }),
        });

        if (!syncResponse.ok) {
          console.error(`[CRON] Sync failed for campaign ${campaign.name}:`, await syncResponse.text());
          continue;
        }

        const syncData = await syncResponse.json();
        console.log(`[CRON] Sync complete for ${campaign.name}:`, syncData.message);

        // Advance/graduate funnel clients before regular tasks get regenerated below,
        // so a same-day graduation is picked up in today's regeneration.
        try {
          const funnelResponse = await fetch(`${baseUrl}/api/google-sheets/sync-funnel-progression`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaignId: campaign.id }),
          });

          if (funnelResponse.ok) {
            const funnelData = await funnelResponse.json();
            console.log(`[CRON] Funnel progression for ${campaign.name}:`, funnelData);
          } else {
            console.warn(`[CRON] Funnel progression failed for ${campaign.name}:`, await funnelResponse.text());
          }
        } catch (funnelErr) {
          console.error(`[CRON] Error running funnel progression for ${campaign.name}:`, funnelErr);
        }

        // Import writers from sheet (ensure they exist before assignment)
        if (syncData.writerAssignments && Object.keys(syncData.writerAssignments).length > 0) {
          try {
            const writerNames = Object.keys(syncData.writerAssignments);
            console.log(`[CRON] Importing ${writerNames.length} writers for ${campaign.name}...`);
            
            const importRes = await fetch(`${baseUrl}/api/google-sheets/import-writers`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ writerNames }),
            });

            if (importRes.ok) {
              const importData = await importRes.json();
              console.log(`[CRON] Writers imported for ${campaign.name}: ${importData.created} created, ${importData.existing} existing`);
            } else {
              console.warn(`[CRON] Writer import failed for ${campaign.name}, continuing anyway...`);
            }
          } catch (importErr) {
            console.error(`[CRON] Error importing writers for ${campaign.name}:`, importErr);
          }
        }

        // Apply changes (deactivate/reactivate, assign writers/associates)
        if (syncData.changes) {
          const applyResponse = await fetch(`${baseUrl}/api/google-sheets/sync-apply-changes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              changes: syncData.changes,
              campaignId: campaign.id,
              associateAssignments: syncData.associateAssignments,
              writerAssignments: syncData.writerAssignments,
            }),
          });

          if (applyResponse.ok) {
            const applyData = await applyResponse.json();
            console.log(`[CRON] Changes applied for ${campaign.name}:`, applyData.message);
            if (applyData.results.writersAssigned > 0) {
              console.log(`[CRON] ✅ Writer tasks generated for ${campaign.name}`);
            }
          }
        }

        // Assign new clients with auto-creation of associates
        if (syncData.changes && syncData.changes.added && syncData.changes.added.length > 0) {
          const assignResponse = await fetch(`${baseUrl}/api/google-sheets/sync-assign-new-clients`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              newClients: syncData.changes.added,
              associateAssignments: syncData.associateAssignments,
              campaignId: campaign.id
            }),
          });

          if (assignResponse.ok) {
            const assignData = await assignResponse.json();
            console.log(`[CRON] New clients assigned for ${campaign.name}:`, assignData.message);
          }
        }

        console.log(`[CRON] Campaign sync completed: ${campaign.name}`);
      } catch (campaignError) {
        console.error(`[CRON] Error syncing campaign ${campaign.name}:`, campaignError);
      }
    }

    // Completed-links syncs (SEO and Web SEO) used to run here too, chained onto the
    // end of this same function call. Removed: this whole chain (client sync, funnel
    // progression, writer import, assignments) can run long on a cold start, and
    // Vercel kills a serverless function that exceeds its execution time limit —
    // silently, with no error surfaced — which meant the completed-links steps at the
    // end sometimes never ran. They now have their own independent, staggered Vercel
    // Cron triggers (see vercel.json: /api/sync-completed-links, /api/sync-webseo-completed-links),
    // so a slow run of this chain can no longer block them.

    console.log('[CRON] All campaigns synced successfully');
  } catch (error) {
    console.error('[CRON] Error in sync job:', error);
  }
}

/**
 * Manually trigger sync (for testing/admin)
 */
export async function triggerSyncNow() {
  console.log('[MANUAL] Triggering sync immediately');
  return runSyncJob();
}
