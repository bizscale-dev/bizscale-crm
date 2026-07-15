export async function GET(request) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return Response.json(
      { error: 'OAuth credentials not configured' },
      { status: 500 }
    );
  }

  // Get the returnTo parameter from query string (single Authorize entry point lives
  // on the Settings page, so that's the default landing spot after connecting)
  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get('returnTo') || '/admin/settings';

  const scope = 'https://www.googleapis.com/auth/spreadsheets.readonly';
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');

  authUrl.searchParams.append('client_id', clientId);
  authUrl.searchParams.append('redirect_uri', redirectUri);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('scope', scope);
  authUrl.searchParams.append('access_type', 'offline');
  authUrl.searchParams.append('prompt', 'consent');
  authUrl.searchParams.append('state', returnTo); // Pass returnTo as state

  return Response.redirect(authUrl.toString());
}
