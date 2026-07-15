/**
 * GET /api/debug/check-sheet-columns?sheetUrl=...
 * Debug endpoint to see exactly what columns the sheet has
 */
import { getDb } from '@/lib/db';
import { parseGoogleSheetUrl } from '@/lib/googleSheets';

async function getStoredToken() {
  const db = await getDb();
  try {
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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sheetUrl = searchParams.get('sheetUrl');

    if (!sheetUrl) {
      return Response.json(
        { error: 'sheetUrl query parameter required' },
        { status: 400 }
      );
    }

    const parsed = parseGoogleSheetUrl(sheetUrl);
    if (!parsed) {
      return Response.json(
        { error: 'Invalid Google Sheets URL' },
        { status: 400 }
      );
    }

    const tokenRecord = await getStoredToken();
    if (!tokenRecord?.access_token) {
      return Response.json(
        { error: 'not_authorized', message: 'No Google access token found' },
        { status: 401 }
      );
    }

    let accessToken = tokenRecord.access_token;

    // Fetch metadata to find sheet name
    const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${parsed.spreadsheetId}`;
    const metadataRes = await fetch(metadataUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!metadataRes.ok) {
      return Response.json(
        { error: 'Failed to fetch sheet metadata' },
        { status: 400 }
      );
    }

    const metadata = await metadataRes.json();
    const sheetName = metadata.sheets?.[0]?.properties?.title || 'Sheet1';

    // Fetch first few rows to see columns
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${parsed.spreadsheetId}/values/'${sheetName}'!A1:Z10?majorDimension=ROWS`;
    
    const res = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      return Response.json(
        { error: 'Failed to fetch sheet data' },
        { status: 400 }
      );
    }

    const data = await res.json();
    const rows = data.values || [];

    // Analyze columns
    const columnLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
    const columnInfo = [];

    if (rows.length > 0) {
      const headerRow = rows[0];
      headerRow.forEach((header, idx) => {
        columnInfo.push({
          column: columnLetters[idx],
          index: idx,
          header: header?.trim() || '(empty)',
          sampleValues: rows.slice(1, 4).map(row => row[idx]?.trim() || '(empty)'),
        });
      });
    }

    return Response.json({
      success: true,
      sheet: {
        spreadsheetId: parsed.spreadsheetId,
        sheetName,
        totalRows: rows.length,
        totalColumns: rows[0]?.length || 0,
      },
      columns: columnInfo,
      hint: {
        columnC: 'Should be Client Names',
        columnH: 'Should be Associate Names',
        columnI: 'Should be Writer Names',
      },
      rawFirstFewRows: rows.slice(0, 5),
    });
  } catch (error) {
    return Response.json(
      { error: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}
