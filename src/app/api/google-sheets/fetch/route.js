import {
  parseGoogleSheetUrl,
  columnLetterToIndex,
  extractClientsFromRows,
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
    const { sheetUrl, nameColumn, websiteColumn, skipHeader } = await request.json();

    // Validate inputs
    if (!sheetUrl || !nameColumn) {
      return Response.json(
        { error: 'Sheet URL and name column are required' },
        { status: 400 }
      );
    }

    // Parse the sheet URL
    const parsed = parseGoogleSheetUrl(sheetUrl);
    if (!parsed) {
      return Response.json(
        { error: 'Invalid Google Sheets URL. Paste the full link from your browser.' },
        { status: 400 }
      );
    }

    // Validate column letters
    const nameColIndex = columnLetterToIndex(nameColumn);
    if (nameColIndex == null) {
      return Response.json(
        { error: 'Invalid client name column. Use a letter like A, B, or C.' },
        { status: 400 }
      );
    }

    let websiteColIndex = null;
    if (websiteColumn && websiteColumn.trim()) {
      websiteColIndex = columnLetterToIndex(websiteColumn);
      if (websiteColIndex == null) {
        return Response.json(
          { error: 'Invalid website column. Use a letter like B or C, or leave it blank.' },
          { status: 400 }
        );
      }
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

    // Try to fetch sheet data - use the "Active Clients" sheet
    let sheetName = 'Active Clients'; // default to Active Clients sheet
    
    try {
      const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${parsed.spreadsheetId}`;
      const metadataRes = await fetch(metadataUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      
      if (metadataRes.ok) {
        const metadata = await metadataRes.json();
        if (metadata.sheets && metadata.sheets.length > 0) {
          // Look for "Active Clients" sheet, fall back to first sheet if not found
          const activeClientsSheet = metadata.sheets.find(
            sheet => sheet.properties.title === 'Active Clients'
          );
          sheetName = activeClientsSheet 
            ? 'Active Clients'
            : metadata.sheets[0].properties.title;
        }
      }
    } catch (err) {
      console.warn('Could not fetch sheet metadata, using Active Clients');
    }

    // Fetch sheet data with proper range
    let apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${parsed.spreadsheetId}/values/'${sheetName}'!A1:Z1000?majorDimension=ROWS`;

    let res = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    // If token expired and we have refresh token, try refreshing
    if (res.status === 401 && refreshToken) {
      try {
        accessToken = await refreshAccessToken(refreshToken);
        
        // Update cookie with new token via response
        // Note: We can't directly set cookies in POST requests, so we'll just use the new token for this request
        
        // Retry with new token
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
          { error: 'not_authorized', message: 'Authorization expired. Please authorize again.' },
          { status: 401 }
        );
      }
    }

    if (!res.ok) {
      const error = await res.json();
      console.error('Google Sheets API error:', error);

      if (res.status === 403) {
        return Response.json(
          {
            error: 'permission_denied',
            message: 'You do not have permission to access this sheet. Ask the sheet owner to share it with you.',
          },
          { status: 403 }
        );
      }

      if (res.status === 404) {
        return Response.json(
          { error: 'not_found', message: 'Sheet not found. Check the URL is correct.' },
          { status: 404 }
        );
      }

      return Response.json(
        { error: 'api_error', message: error.error?.message || 'Failed to fetch sheet' },
        { status: res.status }
      );
    }

    const data = await res.json();
    const rows = data.values || [];

    if (rows.length === 0) {
      return Response.json(
        { error: 'empty_sheet', message: 'The sheet appears to be empty.' },
        { status: 400 }
      );
    }

    // Extract clients
    const clients = extractClientsFromRows(rows, nameColIndex, websiteColIndex, skipHeader);

    if (clients.length === 0) {
      return Response.json(
        { error: 'no_clients', message: 'No clients found in the selected column. Check the column letter and header setting.' },
        { status: 400 }
      );
    }

    return Response.json({
      success: true,
      count: clients.length,
      clients,
    });
  } catch (error) {
    console.error('Google Sheets fetch error:', error);
    return Response.json(
      { error: 'fetch_error', message: error.message || 'Failed to fetch from Google Sheets' },
      { status: 500 }
    );
  }
}
