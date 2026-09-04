import { getDb } from './db';
import { getActiveWebSeoCampaign } from './services';
import { generateWebSeoTasks } from './webSeoTaskGenerator';

// Exported for reuse by other Google Sheets integrations that need named-tab access
// via OAuth (e.g. writerOffpageSync.js) rather than the public CSV-export method.
export async function getValidAccessToken() {
  const db = await getDb();

  try {
    // Get stored tokens
    const tokenRecord = await db.prepare(`
      SELECT access_token, refresh_token, expires_at
      FROM google_oauth_tokens
      WHERE user_id IS NULL
      ORDER BY updated_at DESC
      LIMIT 1
    `).get();

    if (!tokenRecord) {
      return { error: 'No OAuth tokens found. Please authorize with Google first.' };
    }

    let accessToken = tokenRecord.access_token;
    const expiresAt = new Date(tokenRecord.expires_at);
    const now = new Date();

    // Check if token is expired or expiring soon (within 5 minutes)
    if (expiresAt < new Date(now.getTime() + 5 * 60 * 1000)) {
      console.log('[getValidAccessToken] Token expired or expiring, refreshing...');

      if (!tokenRecord.refresh_token) {
        return { error: 'Token expired and no refresh token available. Please authorize again.' };
      }

      // Refresh the token
      const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: tokenRecord.refresh_token,
          client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
          client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
          grant_type: 'refresh_token',
        }),
      });

      if (!refreshResponse.ok) {
        return { error: 'Failed to refresh OAuth token. Please authorize again.' };
      }

      const newTokens = await refreshResponse.json();
      accessToken = newTokens.access_token;
      const newExpiresAt = new Date(Date.now() + (newTokens.expires_in || 3600) * 1000);

      // Update stored tokens
      await db.prepare(`
        UPDATE google_oauth_tokens
        SET access_token = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id IS NULL
      `).run(accessToken, newExpiresAt.toISOString());

      console.log('[getValidAccessToken] Token refreshed successfully');
    }

    return { accessToken };
  } catch (error) {
    console.error('[getValidAccessToken] Error:', error);
    return { error: error.message };
  }
}

/**
 * Shared core of the Web Clients import — pulls the "Active Clients" tab from the given
 * sheet via the Google Sheets API (OAuth), upserts/reactivates clients found in it, and
 * deactivates (not deletes) clients that used to be there but no longer are. Used by both
 * the manual admin-triggered import (src/app/admin/web-clients/actions.js) and the
 * automatic cron trigger (src/app/api/cron/sync-web-clients/route.js), so both paths stay
 * in sync with a single implementation. Throws on failure instead of returning an
 * {error} object so callers can handle it with a plain try/catch.
 */
export async function runWebClientsImport(sheetUrl) {
  if (!sheetUrl) {
    throw new Error('Please provide a Google Sheet URL');
  }

  console.log('[runWebClientsImport] Processing URL:', sheetUrl.substring(0, 50) + '...');

  const sheetIdMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!sheetIdMatch) {
    throw new Error("Invalid Google Sheet URL. Make sure it's a full spreadsheet URL.");
  }

  const sheetId = sheetIdMatch[1];
  console.log('[runWebClientsImport] Sheet ID:', sheetId);

  const campaign = await getActiveWebSeoCampaign();
  if (!campaign) {
    throw new Error('No active Web SEO campaign. Start one from Admin → Web Clients first.');
  }

  const tokenResult = await getValidAccessToken();
  if (tokenResult.error) {
    throw new Error(tokenResult.error);
  }

  const accessToken = tokenResult.accessToken;
  console.log('[runWebClientsImport] Got access token, fetching sheet...');

  const sheetName = 'Active Clients';
  const range = `'${sheetName}'!A:N`;
  const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;

  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  console.log('[runWebClientsImport] Response status:', response.status);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('[runWebClientsImport] API error:', response.status, errorData);

    if (response.status === 404) {
      throw new Error('Sheet not found. Make sure the URL is correct and the sheet is shared with your account.');
    }
    if (response.status === 403) {
      throw new Error('Access denied. Make sure the sheet is shared with the Google account you authorized.');
    }
    if (response.status === 400) {
      throw new Error('Bad request. Make sure the sheet URL is correct.');
    }

    throw new Error(`Failed to fetch Google Sheet: ${response.status}`);
  }

  const data = await response.json();
  const values = data.values || [];

  console.log('[runWebClientsImport] Got', values.length, 'rows from sheet');

  if (values.length < 2) {
    throw new Error('Sheet appears to be empty or has only headers');
  }

  const db = await getDb();
  let importedCount = 0;
  let reactivatedCount = 0;
  const errors = [];
  // Every client name seen in this sheet import — used after the loop to find
  // clients that used to be here but no longer are, so they can be deactivated
  // (history/webseo_tasks preserved, not deleted) instead of silently staying
  // active forever.
  const seenClientNames = new Set();

  const allAssociates = await db.prepare(`
    SELECT id, name FROM users
    WHERE role = 'web_seo_associate' AND is_active = 1
    ORDER BY name
  `).all();
  console.log('[runWebClientsImport] Available associates:', allAssociates.map(a => a.name));

  // Upserts one client from the sheet: creates it if new, reactivates it if it was
  // previously removed, and assigns/updates its associate. Shared by both column
  // pairs below since they're otherwise identical.
  async function upsertClient(clientName, associateName, rowLabel, siteUrl) {
    seenClientNames.add(clientName);
    try {
      const existing = await db.prepare(`
        SELECT id, is_active FROM web_clients
        WHERE webseo_campaign_id = ? AND name = ?
      `).get(campaign.id, clientName);

      let clientId;
      if (!existing) {
        await db.prepare(`
          INSERT INTO web_clients (webseo_campaign_id, business_name, name, is_active)
          VALUES (?, ?, ?, 1)
        `).run(campaign.id, clientName, clientName);

        const newClient = await db.prepare(`
          SELECT id FROM web_clients
          WHERE webseo_campaign_id = ? AND name = ?
        `).get(campaign.id, clientName);
        clientId = newClient.id;
        importedCount++;
        console.log(`[runWebClientsImport] Imported (${rowLabel}): ${clientName}`);
      } else {
        clientId = existing.id;
        if (!existing.is_active) {
          await db.prepare('UPDATE web_clients SET is_active = 1 WHERE id = ?').run(clientId);
          reactivatedCount++;
          console.log(`[runWebClientsImport] Reactivated (${rowLabel}): ${clientName}`);
        }
      }

      // The sheet is the source of truth for the site URL too, same as associate
      // assignment below — always overwrite with whatever's currently in the column.
      if (siteUrl && clientId) {
        await db.prepare('UPDATE web_clients SET website = ? WHERE id = ?').run(siteUrl, clientId);
      }

      if (associateName && clientId) {
        // Captured every time regardless of whether it matches, so an unmatched
        // name is still visible on the client (see the "Unmatched Associate
        // Names" panel on /admin/web-clients) instead of only appearing once in
        // this run's transient error list.
        await db.prepare('UPDATE web_clients SET sheet_associate_name = ? WHERE id = ?').run(associateName, clientId);

        let associate = await db.prepare(`
          SELECT id FROM users
          WHERE LOWER(name) = LOWER(?) AND role = 'web_seo_associate' AND is_active = 1
        `).get(associateName);

        // No exact user-name match — fall back to a previously-saved mapping
        // (an admin manually pointed this exact sheet name at a real associate
        // once; see saveWebAssociateMapping) so the same sheet name doesn't need
        // remapping on every future sync.
        if (!associate) {
          const mapping = await db.prepare(`
            SELECT u.id FROM web_associate_name_mappings m
            JOIN users u ON u.id = m.associate_id
            WHERE LOWER(m.sheet_name) = LOWER(?) AND u.role = 'web_seo_associate' AND u.is_active = 1
          `).get(associateName);
          if (mapping) associate = mapping;
        }

        if (associate) {
          await db.prepare(`
            UPDATE web_clients
            SET assigned_associate_id = ?
            WHERE id = ?
          `).run(associate.id, clientId);
          console.log(`[runWebClientsImport] ✓ Assigned ${associateName} to ${clientName}`);
        } else {
          console.log(`[runWebClientsImport] ✗ Associate "${associateName}" not found in system`);
          errors.push(`${rowLabel}: Associate "${associateName}" not found`);
        }
      }
    } catch (err) {
      console.error(`[runWebClientsImport] Error processing ${rowLabel}:`, err.message);
      errors.push(`${rowLabel}: ${err.message}`);
    }
  }

  // Pair 1: Column C (index 2) = Site URL → Column D (index 3) = Client Names → Column F (index 5) = Associate Names
  // Pair 2: Column K (index 10) = Site URL → Column L (index 11) = Client Names → Column N (index 13) = Associate Names
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row || row.length < 2) continue;

    const site1Url = (row[2] || '').trim();
    const client1Name = (row[3] || '').trim();
    const associate1Name = (row[5] || '').trim();
    if (client1Name) {
      await upsertClient(client1Name, associate1Name, `Row ${i + 1} (Pair 1)`, site1Url);
    }

    const site2Url = (row[10] || '').trim();
    const client2Name = (row[11] || '').trim();
    const associate2Name = (row[13] || '').trim();
    if (client2Name) {
      await upsertClient(client2Name, associate2Name, `Row ${i + 1} (Pair 2)`, site2Url);
    }
  }

  // Deactivate clients that used to be in this sheet but no longer are — keeps their
  // row and webseo_tasks history intact (tracking preserved), just excludes them from
  // future task generation and active-client counts.
  let deactivatedCount = 0;
  const currentlyActive = await db.prepare(`
    SELECT id, name FROM web_clients WHERE webseo_campaign_id = ? AND is_active = 1
  `).all(campaign.id);
  for (const wc of currentlyActive) {
    if (!seenClientNames.has(wc.name)) {
      await db.prepare('UPDATE web_clients SET is_active = 0 WHERE id = ?').run(wc.id);
      deactivatedCount++;
      console.log(`[runWebClientsImport] Deactivated (removed from sheet): ${wc.name}`);
    }
  }

  // Regenerate the batch-rotation task schedule now that clients/assignments changed
  try {
    await generateWebSeoTasks(campaign.id);
  } catch (genErr) {
    console.error('[runWebClientsImport] Failed to regenerate web SEO tasks:', genErr.message);
  }

  let message = `Synced ${importedCount} new, ${reactivatedCount} reactivated, ${deactivatedCount} deactivated web client(s)`;
  if (errors.length > 0) {
    message += `. (${errors.length} error(s): ${errors.join('; ')})`;
  }

  return { message, importedCount, reactivatedCount, deactivatedCount, errors };
}
