import {
  parseGoogleSheetUrl,
  columnLetterToIndex,
} from '@/lib/googleSheets';
import { cookies } from 'next/headers';

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
    const { sheetUrl, associateColumn, clientColumn, skipHeader } = await request.json();

    // Validate inputs
    if (!sheetUrl || !associateColumn || !clientColumn) {
      return Response.json(
        { error: 'Sheet URL and columns are required' },
        { status: 400 }
      );
    }

    // Parse the sheet URL
    const parsed = parseGoogleSheetUrl(sheetUrl);
    if (!parsed) {
      return Response.json(
        { error: 'Invalid Google Sheets URL' },
        { status: 400 }
      );
    }

    // Validate column letters
    const associateColIndex = columnLetterToIndex(associateColumn);
    const clientColIndex = columnLetterToIndex(clientColumn);
    
    if (associateColIndex == null || clientColIndex == null) {
      return Response.json(
        { error: 'Invalid column letters' },
        { status: 400 }
      );
    }

    // Get access token from cookies
    const cookieStore = await cookies();
    let accessToken = cookieStore.get('google_access_token')?.value;
    const refreshToken = cookieStore.get('google_refresh_token')?.value;

    if (!accessToken) {
      return Response.json(
        { error: 'not_authorized', message: 'Please authorize with Google first' },
        { status: 401 }
      );
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
      console.warn('Could not fetch sheet metadata, using Active Clients');
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

    // If token expired, try refreshing
    if (res.status === 401 && refreshToken) {
      try {
        accessToken = await refreshAccessToken(refreshToken);
        res = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });
      } catch (err) {
        console.error('Token refresh error:', err);
        return Response.json(
          { error: 'not_authorized', message: 'Authorization expired' },
          { status: 401 }
        );
      }
    }

    if (!res.ok) {
      const error = await res.json();
      console.error('Google Sheets API error:', error);
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

    // Process rows - extract associates and their clients
    const associates = {}; // { "Associate Name": ["Client 1", "Client 2", ...] }
    const startRow = skipHeader ? 1 : 0;

    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
      const associate = row[associateColIndex]?.trim();
      const client = row[clientColIndex]?.trim();

      if (associate && client) {
        if (!associates[associate]) {
          associates[associate] = [];
        }
        // Add client only if not already present (deduplicate per associate)
        if (!associates[associate].includes(client)) {
          associates[associate].push(client);
        }
      }
    }

    const associatesList = Object.entries(associates).map(([name, clients]) => ({
      name,
      clients,
    }));

    if (associatesList.length === 0) {
      return Response.json(
        { error: 'no_data', message: 'No associates or clients found' },
        { status: 400 }
      );
    }

    return Response.json({
      success: true,
      count: associatesList.length,
      associates: associatesList,
    });
  } catch (error) {
    console.error('Google Sheets fetch error:', error);
    return Response.json(
      { error: 'fetch_error', message: error.message },
      { status: 500 }
    );
  }
}
