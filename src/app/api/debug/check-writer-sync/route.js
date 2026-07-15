import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import { parseGoogleSheetUrl, fetchGoogleSheetRows } from '@/lib/googleSheets';

export async function GET(request) {
  try {
    const db = await getDb();
    const campaign = await getActiveCampaign();

    if (!campaign) {
      return Response.json({ error: 'No active campaign' }, { status: 400 });
    }

    // 1. Check writers in database
    const dbWriters = await db.prepare(`
      SELECT id, name, role FROM users WHERE role = 'writer' AND is_active = 1
    `).all();

    // 2. Check clients in database
    const dbClients = await db.prepare(`
      SELECT id, name, assigned_writer_id FROM clients WHERE campaign_id = ? AND is_active = 1
    `).all(campaign.id);

    // 3. Check Google Sheet
    const settings = await db.prepare("SELECT value FROM settings WHERE key = ?").get('google_sheets_url');
    const sheetUrl = settings?.value;

    let sheetData = null;
    let sheetError = null;
    let writerAssignmentsFromSheet = {};

    if (sheetUrl) {
      try {
        const parsed = parseGoogleSheetUrl(sheetUrl);
        const rows = await fetchGoogleSheetRows(parsed.exportUrl);

        // Parse to get writer assignments (Column I)
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const clientName = row[2]?.trim(); // Column C
          const writerName = row[8]?.trim(); // Column I

          if (clientName && writerName) {
            if (!writerAssignmentsFromSheet[writerName]) {
              writerAssignmentsFromSheet[writerName] = [];
            }
            writerAssignmentsFromSheet[writerName].push(clientName);
          }
        }

        sheetData = {
          totalRows: rows.length,
          headerRow: rows[0] ? rows[0].slice(0, 10) : null,
          sampleData: rows.slice(1, 6).map(row => ({
            clientName: row[2],
            associate: row[7],
            writer: row[8],
          })),
        };
      } catch (err) {
        sheetError = err.message;
      }
    }

    // 4. Check writer_assignments table
    const writerAssignments = await db.prepare(`
      SELECT DISTINCT u.id, u.name
      FROM users u
      JOIN writer_assignments wa ON wa.user_id = u.id
      WHERE wa.campaign_id = ? AND u.is_active = 1
    `).all(campaign.id);

    // 5. Check if any clients have assigned_writer_id
    const clientsWithWriters = await db.prepare(`
      SELECT c.id, c.name, c.assigned_writer_id, u.name as writer_name
      FROM clients c
      LEFT JOIN users u ON u.id = c.assigned_writer_id
      WHERE c.campaign_id = ? AND c.assigned_writer_id IS NOT NULL
    `).all(campaign.id);

    return Response.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
      },
      debug: {
        database: {
          writersInDB: dbWriters.map(w => ({ id: w.id, name: w.name })),
          totalClientsInDB: dbClients.length,
          clientsWithWriterAssignments: clientsWithWriters.length,
          clientsWithWriterDetail: clientsWithWriters.slice(0, 10),
          writerAssignmentsTable: writerAssignments.map(w => ({ id: w.id, name: w.name })),
        },
        googleSheet: {
          sheetUrl: sheetUrl ? '✓ Configured' : '✗ Not configured',
          writerNamesInSheet: Object.keys(writerAssignmentsFromSheet),
          writerAssignments: writerAssignmentsFromSheet,
          sheetData,
          sheetError,
        },
        analysis: {
          message: generateAnalysisMessage(
            dbWriters,
            Object.keys(writerAssignmentsFromSheet),
            clientsWithWriters.length
          ),
        },
      }
    });
  } catch (error) {
    return Response.json(
      { error: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}

function generateAnalysisMessage(dbWriters, sheetWriterNames, assignedClientsCount) {
  const dbWriterNames = dbWriters.map(w => w.name);
  
  const messages = [];
  
  if (dbWriters.length === 0) {
    messages.push('❌ No writers in database');
  } else {
    messages.push(`✓ Found ${dbWriters.length} writers in database`);
  }

  if (sheetWriterNames.length === 0) {
    messages.push('❌ No writers found in Google Sheet Column I');
  } else {
    messages.push(`✓ Found ${sheetWriterNames.length} writer names in Google Sheet`);
  }

  if (assignedClientsCount === 0) {
    messages.push('❌ No clients have assigned_writer_id');
  } else {
    messages.push(`✓ ${assignedClientsCount} clients have writers assigned`);
  }

  // Check if sheet writers match DB writers
  const matchedWriters = sheetWriterNames.filter(name => 
    dbWriterNames.some(dbName => dbName.toLowerCase() === name.toLowerCase())
  );

  if (matchedWriters.length === sheetWriterNames.length && sheetWriterNames.length > 0) {
    messages.push(`✓ All ${matchedWriters.length} writers in sheet match database`);
  } else if (matchedWriters.length > 0) {
    const unmatchedWriters = sheetWriterNames.filter(name =>
      !dbWriterNames.some(dbName => dbName.toLowerCase() === name.toLowerCase())
    );
    messages.push(`⚠️  ${matchedWriters.length}/${sheetWriterNames.length} writers match. Unmatched: ${unmatchedWriters.join(', ')}`);
  }

  return messages.join('\n');
}
