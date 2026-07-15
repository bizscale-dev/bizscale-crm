/**
 * POST /api/debug/force-sync-writers
 * Force syncs writers from Google Sheet using OAuth token
 */
import { getDb, initDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import { parseGoogleSheetUrl } from '@/lib/googleSheets';
import { generateWriterTasks } from '@/lib/writerTaskGenerator';

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

export async function POST(request) {
  try {
    await initDb();
    const db = await getDb();
    const campaign = await getActiveCampaign();

    if (!campaign) {
      return Response.json({ error: 'No active campaign' }, { status: 400 });
    }

    // Get Google Sheet URL
    const settings = await db.prepare("SELECT value FROM settings WHERE key = ?").get('google_sheets_url');
    if (!settings?.value) {
      return Response.json({ error: 'No Google Sheet URL configured' }, { status: 400 });
    }

    // Get OAuth token
    const tokenRecord = await db.prepare(`
      SELECT access_token, refresh_token, expires_at 
      FROM google_oauth_tokens 
      WHERE user_id IS NULL 
      ORDER BY updated_at DESC 
      LIMIT 1
    `).get();

    if (!tokenRecord?.access_token) {
      return Response.json({ error: 'Not authorized with Google. Please authorize first.' }, { status: 401 });
    }

    let accessToken = tokenRecord.access_token;

    // Check if token is expired and refresh if needed
    if (tokenRecord.expires_at) {
      const expiresAt = new Date(tokenRecord.expires_at);
      if (expiresAt < new Date()) {
        if (tokenRecord.refresh_token) {
          try {
            accessToken = await refreshAccessToken(tokenRecord.refresh_token);
            await db.prepare(`
              UPDATE google_oauth_tokens 
              SET access_token = ?, expires_at = datetime('now', '+1 hour')
              WHERE user_id IS NULL
            `).run(accessToken);
          } catch (err) {
            return Response.json({ error: 'Token refresh failed' }, { status: 401 });
          }
        }
      }
    }

    // Fetch sheet using OAuth
    const parsed = parseGoogleSheetUrl(settings.value);
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

    // Fetch sheet data using OAuth
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${parsed.spreadsheetId}/values/'${sheetName}'!A1:Z1000?majorDimension=ROWS`;
    const res = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch sheet: HTTP ${res.status}`);
    }

    const data = await res.json();
    const rows = data.values || [];

    if (rows.length === 0) {
      return Response.json({ error: 'Sheet has no data' }, { status: 400 });
    }

    // Parse to get writer assignments (Column I)
    const writerAssignments = {};
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const clientName = row[2]?.trim(); // Column C
      const writerName = row[8]?.trim(); // Column I

      if (clientName && writerName) {
        if (!writerAssignments[writerName]) {
          writerAssignments[writerName] = [];
        }
        writerAssignments[writerName].push(clientName);
      }
    }

    console.log('[force-sync] Writer assignments from sheet:', Object.keys(writerAssignments));

    // Import writers first (create if don't exist)
    let importedWriters = 0;
    const writerNames = Object.keys(writerAssignments);
    const bcrypt = require('bcryptjs');

    for (const writerName of writerNames) {
      const existingWriter = await db.prepare(
        "SELECT id FROM users WHERE role = 'writer' AND name = ?"
      ).get(writerName);

      if (!existingWriter) {
        const defaultPassword = bcrypt.hashSync(Math.random().toString(36).substring(7), 10);
        const email = `${writerName.toLowerCase().replace(/\s+/g, '.')}@writers.local`;
        await db.prepare(
          "INSERT INTO users (name, email, password, role, is_active) VALUES (?, ?, ?, ?, ?)"
        ).run(writerName, email, defaultPassword, 'writer', 1);
        importedWriters++;
        console.log(`[force-sync] Created writer: ${writerName}`);
      }
    }

    // Apply assignments
    let assignedCount = 0;
    for (const [writerName, clientNames] of Object.entries(writerAssignments)) {
      const writer = await db.prepare(
        "SELECT id FROM users WHERE role = 'writer' AND name = ?"
      ).get(writerName);

      if (writer) {
        // Ensure writer is assigned to campaign
        const assignment = await db.prepare(
          "SELECT id FROM writer_assignments WHERE campaign_id = ? AND user_id = ?"
        ).get(campaign.id, writer.id);

        if (!assignment) {
          await db.prepare(
            "INSERT INTO writer_assignments (campaign_id, user_id, daily_post_target) VALUES (?, ?, 52)"
          ).run(campaign.id, writer.id);
        }

        for (const clientName of clientNames) {
          const client = await db.prepare(
            "SELECT id FROM clients WHERE campaign_id = ? AND name = ?"
          ).get(campaign.id, clientName);

          if (client) {
            await db.prepare(
              "UPDATE clients SET assigned_writer_id = ? WHERE id = ?"
            ).run(writer.id, client.id);
            assignedCount++;
            console.log(`[force-sync] Assigned ${clientName} to ${writerName}`);
          }
        }
      }
    }

    // Generate tasks
    let tasksCreated = 0;
    let taskGenerationError = null;
    try {
      console.log('[force-sync] Calling generateWriterTasks...');
      const taskResult = await generateWriterTasks(campaign.id);
      tasksCreated = taskResult.taskCount || 0;
      console.log(`[force-sync] Task generation result:`, taskResult);
    } catch (err) {
      taskGenerationError = err.message;
      console.error('[force-sync] Task generation error:', err.message, err.stack);
    }

    // Check results
    const clientsWithWriters = await db.prepare(`
      SELECT c.id, c.name, u.name as writer_name
      FROM clients c
      LEFT JOIN users u ON u.id = c.assigned_writer_id
      WHERE c.campaign_id = ? AND c.assigned_writer_id IS NOT NULL
    `).all(campaign.id);

    // Check tasks created
    const writingTasksCount = await db.prepare(`
      SELECT COUNT(*) as total FROM writing_tasks WHERE campaign_id = ?
    `).get(campaign.id);

    return Response.json({
      success: true,
      results: {
        writersImported: importedWriters,
        clientsAssigned: assignedCount,
        tasksCreated: writingTasksCount.total,
        taskGenerationError,
      },
      clientDetails: clientsWithWriters.slice(0, 20),
      message: `Force sync complete: ${importedWriters} writers imported, ${assignedCount} clients assigned, ${writingTasksCount.total} tasks created${taskGenerationError ? ` (Warning: ${taskGenerationError})` : ''}`,
    });
  } catch (error) {
    console.error('[force-sync] Error:', error);
    return Response.json(
      { error: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}
