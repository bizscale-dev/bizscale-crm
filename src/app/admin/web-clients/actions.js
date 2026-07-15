'use server';

import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import { generateWebSeoTasks } from '@/lib/webSeoTaskGenerator';
import { revalidatePath } from 'next/cache';

async function getValidAccessToken() {
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

export async function importWebClientsFromGoogleSheet(formData) {
  try {
    const sheetUrl = formData.get('sheet_url');
    if (!sheetUrl) {
      return { error: 'Please provide a Google Sheet URL' };
    }

    console.log('[importWebClientsFromGoogleSheet] Processing URL:', sheetUrl.substring(0, 50) + '...');

    // Extract sheet ID from URL
    const sheetIdMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!sheetIdMatch) {
      return { error: 'Invalid Google Sheet URL. Make sure it\'s a full spreadsheet URL.' };
    }

    const sheetId = sheetIdMatch[1];
    console.log('[importWebClientsFromGoogleSheet] Sheet ID:', sheetId);

    const campaign = await getActiveCampaign();
    if (!campaign) {
      return { error: 'No active campaign' };
    }

    // Get valid access token from cache
    const tokenResult = await getValidAccessToken();
    if (tokenResult.error) {
      return { error: tokenResult.error };
    }

    const accessToken = tokenResult.accessToken;
    console.log('[importWebClientsFromGoogleSheet] Got access token, fetching sheet...');

    // Use Google Sheets API v4 to fetch data - use the sheet name "Active Clients"
    const sheetName = 'Active Clients';
    // Fetch columns A through N to get all needed data
    // Column C (index 2) + L (index 11), and Column F (index 5) + N (index 13)
    const range = `'${sheetName}'!A:N`;
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;
    
    console.log('[importWebClientsFromGoogleSheet] API URL base:', `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/`);
    console.log('[importWebClientsFromGoogleSheet] Range:', range);
    console.log('[importWebClientsFromGoogleSheet] Full API URL:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    console.log('[importWebClientsFromGoogleSheet] Response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[importWebClientsFromGoogleSheet] API error:', response.status, errorData);
      
      if (response.status === 404) {
        return { error: 'Sheet not found. Make sure the URL is correct and the sheet is shared with your account.' };
      }
      if (response.status === 403) {
        return { error: 'Access denied. Make sure the sheet is shared with the Google account you authorized.' };
      }
      if (response.status === 400) {
        return { error: 'Bad request. Make sure the sheet URL is correct.' };
      }
      
      return { error: `Failed to fetch Google Sheet: ${response.status}` };
    }

    const data = await response.json();
    const values = data.values || [];

    console.log('[importWebClientsFromGoogleSheet] Got', values.length, 'rows from sheet');

    if (values.length < 2) {
      return { error: 'Sheet appears to be empty or has only headers' };
    }

    const db = await getDb();
    let importedCount = 0;
    const errors = [];

    // First, log all available associates in the system
    const allAssociates = await db.prepare(`
      SELECT id, name FROM users 
      WHERE role = 'web_seo_associate' AND is_active = 1
      ORDER BY name
    `).all();
    console.log('[importWebClientsFromGoogleSheet] Available associates:', allAssociates.map(a => a.name));

    // Parse data from Google Sheets
    // Pair 1: Column D (index 3) = Client Names → Column F (index 5) = Associate Names
    // Pair 2: Column L (index 11) = Client Names → Column N (index 13) = Associate Names
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (!row || row.length < 2) {
        continue;
      }

      // Process Pair 1: Column D + F
      const client1Name = (row[3] || '').trim();
      const associate1Name = (row[5] || '').trim();
      console.log(`[importWebClientsFromGoogleSheet] Row ${i+1} Pair 1 - Client: "${client1Name}" | Associate: "${associate1Name}"`);
      
      if (client1Name) {
        try {
          // Check if client already exists
          const existing = await db.prepare(`
            SELECT id FROM web_clients 
            WHERE campaign_id = ? AND name = ?
          `).get(campaign.id, client1Name);

          let clientId;
          if (!existing) {
            await db.prepare(`
              INSERT INTO web_clients (campaign_id, business_name, name)
              VALUES (?, ?, ?)
            `).run(campaign.id, client1Name, client1Name);
            
            const newClient = await db.prepare(`
              SELECT id FROM web_clients 
              WHERE campaign_id = ? AND name = ?
            `).get(campaign.id, client1Name);
            clientId = newClient.id;
            importedCount++;
            console.log(`[importWebClientsFromGoogleSheet] Imported (Pair 1): ${client1Name}`);
          } else {
            clientId = existing.id;
          }

          // Assign associate if provided
          if (associate1Name && clientId) {
            console.log(`[importWebClientsFromGoogleSheet] Looking for associate: "${associate1Name}"`);
            const associate = await db.prepare(`
              SELECT id FROM users 
              WHERE LOWER(name) = LOWER(?) AND role = 'web_seo_associate' AND is_active = 1
            `).get(associate1Name);

            if (associate) {
              await db.prepare(`
                UPDATE web_clients 
                SET assigned_associate_id = ?
                WHERE id = ?
              `).run(associate.id, clientId);
              console.log(`[importWebClientsFromGoogleSheet] ✓ Assigned ${associate1Name} to ${client1Name}`);
            } else {
              console.log(`[importWebClientsFromGoogleSheet] ✗ Associate "${associate1Name}" not found in system`);
              errors.push(`Row ${i+1} (Pair 1): Associate "${associate1Name}" not found`);
            }
          }
        } catch (err) {
          console.error(`[importWebClientsFromGoogleSheet] Error processing Pair 1 row ${i+1}:`, err.message);
          errors.push(`Row ${i+1} (Pair 1): ${err.message}`);
        }
      }

      // Process Pair 2: Column L + N
      const client2Name = (row[11] || '').trim();
      const associate2Name = (row[13] || '').trim();
      console.log(`[importWebClientsFromGoogleSheet] Row ${i+1} Pair 2 - Client: "${client2Name}" | Associate: "${associate2Name}"`);
      
      if (client2Name) {
        try {
          // Check if client already exists
          const existing = await db.prepare(`
            SELECT id FROM web_clients 
            WHERE campaign_id = ? AND name = ?
          `).get(campaign.id, client2Name);

          let clientId;
          if (!existing) {
            await db.prepare(`
              INSERT INTO web_clients (campaign_id, business_name, name)
              VALUES (?, ?, ?)
            `).run(campaign.id, client2Name, client2Name);
            
            const newClient = await db.prepare(`
              SELECT id FROM web_clients 
              WHERE campaign_id = ? AND name = ?
            `).get(campaign.id, client2Name);
            clientId = newClient.id;
            importedCount++;
            console.log(`[importWebClientsFromGoogleSheet] Imported (Pair 2): ${client2Name}`);
          } else {
            clientId = existing.id;
          }

          // Assign associate if provided
          if (associate2Name && clientId) {
            console.log(`[importWebClientsFromGoogleSheet] Looking for associate: "${associate2Name}"`);
            const associate = await db.prepare(`
              SELECT id FROM users 
              WHERE LOWER(name) = LOWER(?) AND role = 'web_seo_associate' AND is_active = 1
            `).get(associate2Name);

            if (associate) {
              await db.prepare(`
                UPDATE web_clients 
                SET assigned_associate_id = ?
                WHERE id = ?
              `).run(associate.id, clientId);
              console.log(`[importWebClientsFromGoogleSheet] ✓ Assigned ${associate2Name} to ${client2Name}`);
            } else {
              console.log(`[importWebClientsFromGoogleSheet] ✗ Associate "${associate2Name}" not found in system`);
              errors.push(`Row ${i+1} (Pair 2): Associate "${associate2Name}" not found`);
            }
          }
        } catch (err) {
          console.error(`[importWebClientsFromGoogleSheet] Error processing Pair 2 row ${i+1}:`, err.message);
          errors.push(`Row ${i+1} (Pair 2): ${err.message}`);
        }
      }
    }

    // Regenerate the batch-rotation task schedule now that clients/assignments changed
    try {
      await generateWebSeoTasks(campaign.id);
    } catch (genErr) {
      console.error('[importWebClientsFromGoogleSheet] Failed to regenerate web SEO tasks:', genErr.message);
    }

    revalidatePath('/admin/web-clients');
    revalidatePath('/admin/web-seo-associates');
    revalidatePath('/admin');

    let message = `Successfully imported ${importedCount} web client(s)`;
    if (errors.length > 0) {
      message += `. (${errors.length} error(s): ${errors.join('; ')})`;
    }

    return {
      success: true,
      message
    };
  } catch (error) {
    console.error('[importWebClientsFromGoogleSheet] Exception:', error);
    return { error: error.message || 'Unknown error occurred' };
  }
}

export async function assignWebAssociate(clientId, associateId) {
  try {
    const db = await getDb();
    const campaign = await getActiveCampaign();

    if (!campaign) {
      return { error: 'No active campaign' };
    }

    // Verify client belongs to this campaign
    const client = await db.prepare(`
      SELECT id FROM web_clients 
      WHERE id = ? AND campaign_id = ?
    `).get(clientId, campaign.id);

    if (!client) {
      return { error: 'Client not found' };
    }

    // Verify associate exists and has web_seo_associate role
    const associate = await db.prepare(`
      SELECT id FROM users 
      WHERE id = ? AND role = 'web_seo_associate'
    `).get(associateId);

    if (!associate) {
      return { error: 'Web SEO Associate not found' };
    }

    // Update assignment
    await db.prepare(`
      UPDATE web_clients
      SET assigned_associate_id = ?
      WHERE id = ?
    `).run(associateId, clientId);

    // Regenerate the batch-rotation task schedule now that assignments changed
    try {
      await generateWebSeoTasks(campaign.id);
    } catch (genErr) {
      console.error('[assignWebAssociate] Failed to regenerate web SEO tasks:', genErr.message);
    }

    revalidatePath('/admin/web-clients');
    revalidatePath('/admin/web-seo-associates');
    revalidatePath('/admin');

    return { success: true, message: 'Associate assigned successfully' };
  } catch (error) {
    console.error('Assignment error:', error);
    return { error: error.message };
  }
}
