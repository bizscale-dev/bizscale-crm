import { getDb, initDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import { parseGoogleSheetUrl, columnLetterToIndex } from '@/lib/googleSheets';

async function refreshAccessToken(refreshToken) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error('Failed to refresh access token');
  }

  const tokens = await tokenResponse.json();
  return tokens.access_token;
}

async function getStoredToken() {
  const db = await getDb();
  try {
    // Get the most recent token (system-wide token stored with user_id = NULL)
    const token = await db.prepare(`
      SELECT access_token, refresh_token, expires_at 
      FROM google_oauth_tokens 
      WHERE user_id IS NULL 
      ORDER BY updated_at DESC 
      LIMIT 1
    `).get();
    return token || null;
  } catch (err) {
    console.error('Error reading token from database:', err);
    return null;
  }
}

export async function POST(request) {
  try {
    await initDb(); // Ensure tables are created
    const db = await getDb();
    
    // Get campaignId from request, otherwise use active campaign
    const { sheetUrl, campaignId } = await request.json();
    
    let campaign = null;
    if (campaignId) {
      campaign = await db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
    } else {
      campaign = await getActiveCampaign();
    }

    if (!campaign) {
      return Response.json(
        { error: 'No active campaign' },
        { status: 400 }
      );
    }

    if (!sheetUrl) {
      return Response.json(
        { error: 'Sheet URL required' },
        { status: 400 }
      );
    }

    // Parse sheet URL
    const parsed = parseGoogleSheetUrl(sheetUrl);
    if (!parsed) {
      return Response.json(
        { error: 'Invalid Google Sheets URL' },
        { status: 400 }
      );
    }

    // Get access token from database
    const tokenRecord = await getStoredToken();
    
    if (!tokenRecord || !tokenRecord.access_token) {
      console.log('[sync-clients] No stored token found');
      return Response.json(
        { error: 'not_authorized', message: 'Please authorize with Google first' },
        { status: 401 }
      );
    }

    let accessToken = tokenRecord.access_token;
    const refreshToken = tokenRecord.refresh_token;

    // Check if token is expired
    if (tokenRecord.expires_at) {
      const expiresAt = new Date(tokenRecord.expires_at);
      if (expiresAt < new Date()) {
        console.log('[sync-clients] Token expired, attempting refresh...');
        if (refreshToken) {
          try {
            accessToken = await refreshAccessToken(refreshToken);
            // Update the token in database
            await db.prepare(`
              UPDATE google_oauth_tokens 
              SET access_token = ?, expires_at = datetime('now', '+1 hour')
              WHERE user_id IS NULL
            `).run(accessToken);
            console.log('[sync-clients] Token refreshed successfully');
          } catch (err) {
            console.error('[sync-clients] Token refresh failed:', err);
            return Response.json(
              { error: 'not_authorized', message: 'Token refresh failed' },
              { status: 401 }
            );
          }
        } else {
          return Response.json(
            { error: 'not_authorized', message: 'Token expired and no refresh token available' },
            { status: 401 }
          );
        }
      }
    }

    // Get sheet name
    let sheetName = 'Active Clients';
    try {
      const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${parsed.spreadsheetId}`;
      const metadataRes = await fetch(metadataUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (metadataRes.ok) {
        const metadata = await metadataRes.json();
        if (metadata.sheets && metadata.sheets.length > 0) {
          const activeClientsSheet = metadata.sheets.find(
            sheet => sheet.properties.title === 'Active Clients'
          );
          sheetName = activeClientsSheet ? 'Active Clients' : metadata.sheets[0].properties.title;
        }
      }
    } catch (err) {
      console.warn('Could not fetch sheet metadata');
    }

    // Fetch sheet data
    let apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${parsed.spreadsheetId}/values/'${sheetName}'!A1:Z1000?majorDimension=ROWS`;

    let res = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    // If token expired, refresh and retry
    if (res.status === 401 && refreshToken) {
      try {
        accessToken = await refreshAccessToken(refreshToken);
        await db.prepare(`
          UPDATE google_oauth_tokens 
          SET access_token = ?, expires_at = datetime('now', '+1 hour')
          WHERE user_id IS NULL
        `).run(accessToken);
        res = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });
      } catch (err) {
        return Response.json(
          { error: 'not_authorized', message: 'Authorization expired' },
          { status: 401 }
        );
      }
    }

    if (!res.ok) {
      const error = await res.json();
      return Response.json(
        { error: 'api_error', message: 'Failed to fetch sheet' },
        { status: res.status }
      );
    }

    const data = await res.json();
    const rows = data.values || [];

    if (rows.length === 0) {
      return Response.json(
        { error: 'empty_sheet', message: 'The sheet is empty' },
        { status: 400 }
      );
    }

    // Parse sheet to get associate/writer -> clients mapping
    // Column C (index 2) = Client Names
    // Column H (index 7) = Associate Names
    // Column I (index 8) = Writer Names
    const associateAssignments = {}; // { "Associate Name": ["Client 1", "Client 2", ...] }
    const writerAssignments = {}; // { "Writer Name": ["Client 1", "Client 2", ...] }
    const sheetClients = new Map(); // name -> { name, website }

    console.log(`[sync-clients] Sheet has ${rows.length} total rows`);
    console.log(`[sync-clients] Header row: ${rows[0]?.join(' | ')}`);

    // Parse row by row to find which associate/writer has which clients
    let parsedCount = 0;
    for (let i = 1; i < rows.length; i++) { // Skip header
      const row = rows[i];
      const clientName = row[2]?.trim(); // Column C (index 2)
      const associateName = row[7]?.trim(); // Column H (index 7)
      const writerName = row[8]?.trim(); // Column I (index 8)

      if (clientName) {
        parsedCount++;
        // Add client to map (no website in this sheet, so empty string)
        sheetClients.set(clientName.toLowerCase(), { name: clientName, website: '' });

        // Add to associate assignment
        if (associateName) {
          if (!associateAssignments[associateName]) {
            associateAssignments[associateName] = [];
          }
          if (!associateAssignments[associateName].includes(clientName)) {
            associateAssignments[associateName].push(clientName);
          }
        }

        // Add to writer assignment
        if (writerName) {
          if (!writerAssignments[writerName]) {
            writerAssignments[writerName] = [];
          }
          if (!writerAssignments[writerName].includes(clientName)) {
            writerAssignments[writerName].push(clientName);
          }
        }
      }
    }

    console.log(`[sync-clients] Parsed ${parsedCount} clients from sheet`);
    console.log(`[sync-clients] Writer assignments found: ${Object.keys(writerAssignments).length} writers`);
    if (Object.keys(writerAssignments).length > 0) {
      console.log(`[sync-clients] Writers: ${Object.keys(writerAssignments).join(', ')}`);
      Object.entries(writerAssignments).forEach(([writer, clients]) => {
        console.log(`  - ${writer}: ${clients.length} clients`);
      });
    }
    console.log(`[sync-clients] Associate assignments found: ${Object.keys(associateAssignments).length} associates`);
    if (Object.keys(associateAssignments).length > 0) {
      console.log(`[sync-clients] Associates: ${Object.keys(associateAssignments).join(', ')}`);
    }

    // Get current database clients
    const dbClients = await db.prepare(
      "SELECT id, name, website, is_active FROM clients WHERE campaign_id = ? ORDER BY name"
    ).all(campaign.id);

    const dbClientMap = new Map(
      dbClients.map(c => [c.name.toLowerCase(), c])
    );

    // Compare and find changes
    const changes = {
      added: [],      // New clients in sheet
      removed: [],    // Clients in DB but not in sheet
      reactivated: [], // Was inactive, now in sheet
      deactivated: [], // Was active, now removed from sheet
    };

    // Find added/reactivated
    for (const [lowerName, sheetClient] of sheetClients) {
      const dbClient = dbClientMap.get(lowerName);

      if (!dbClient) {
        changes.added.push(sheetClient);
      } else if (!dbClient.is_active) {
        changes.reactivated.push({ ...sheetClient, db_id: dbClient.id });
      }
    }

    // Find removed/deactivated
    for (const dbClient of dbClients) {
      if (!sheetClients.has(dbClient.name.toLowerCase())) {
        if (dbClient.is_active) {
          changes.deactivated.push(dbClient);
        }
      }
    }

    // Return summary with associate and writer assignments
    return Response.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        total_days: campaign.total_days,
        start_date: campaign.start_date,
      },
      totalClientsInSheet: sheetClients.size,
      totalClientsInDB: dbClients.filter(c => c.is_active).length,
      changes,
      associateAssignments, // Pass the sheet's associate assignments
      writerAssignments,    // Pass the sheet's writer assignments
      message: `Found ${changes.added.length} new, ${changes.reactivated.length} reactivated, ${changes.deactivated.length} deactivated clients`,
    });
  } catch (error) {
    console.error('Sync error:', error);
    return Response.json(
      { error: 'sync_error', message: error.message },
      { status: 500 }
    );
  }
}
