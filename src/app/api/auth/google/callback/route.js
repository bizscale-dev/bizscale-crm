export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const state = searchParams.get('state'); // Get returnTo from state
    const returnTo = (state && state.startsWith('/')) ? state : '/admin/settings'; // Default redirect

    console.log('[OAuth Callback] Code:', code?.substring(0, 20) + '...');
    console.log('[OAuth Callback] Error:', error);
    console.log('[OAuth Callback] Return to:', returnTo);

    // Helper to build redirect URL
    const buildRedirectUrl = (baseUrl, params) => {
      const url = new URL(baseUrl, request.url);
      Object.entries(params).forEach(([key, value]) => {
        if (value) url.searchParams.set(key, value);
      });
      return url.toString();
    };

    if (error) {
      console.log('[OAuth Callback] Google error received');
      return Response.redirect(buildRedirectUrl(returnTo, { error }));
    }

    if (!code) {
      console.log('[OAuth Callback] No code received');
      return Response.redirect(buildRedirectUrl(returnTo, { error: 'no_code' }));
    }

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

    console.log('[OAuth Callback] Config check:', { clientId: !!clientId, clientSecret: !!clientSecret, redirectUri });

    if (!clientId || !clientSecret || !redirectUri) {
      console.log('[OAuth Callback] Missing config');
      return Response.redirect(buildRedirectUrl(returnTo, { error: 'config_missing' }));
    }

    console.log('[OAuth Callback] Exchanging code for tokens...');

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    console.log('[OAuth Callback] Token response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('[OAuth Callback] Token exchange failed:', errorData);
      return Response.redirect(buildRedirectUrl(returnTo, { error: 'token_exchange_failed' }));
    }

    const tokens = await tokenResponse.json();
    console.log('[OAuth Callback] Tokens received:', { access_token: !!tokens.access_token, refresh_token: !!tokens.refresh_token });

    const { access_token, refresh_token, expires_in } = tokens;

    // Store tokens in database instead of cookies
    const { getDb, initDb } = await import('@/lib/db');
    await initDb(); // Ensure tables are created
    const db = await getDb();

    // Calculate token expiration time
    const expiresAt = new Date(Date.now() + (expires_in || 3600) * 1000);

    // Delete old token record first, then insert new one
    try {
      await db.prepare(`DELETE FROM google_oauth_tokens WHERE user_id IS NULL`).run();
      await db.prepare(`
        INSERT INTO google_oauth_tokens (user_id, access_token, refresh_token, expires_at)
        VALUES (NULL, ?, ?, ?)
      `).run(access_token, refresh_token, expiresAt.toISOString());
      console.log('[OAuth Callback] Tokens stored in database');
    } catch (dbError) {
      console.error('[OAuth Callback] Failed to store tokens:', dbError);
      return Response.redirect(buildRedirectUrl(returnTo, { error: 'db_error', message: dbError.message }));
    }

    console.log('[OAuth Callback] Redirecting to', returnTo, '?success=authorized');
    return Response.redirect(buildRedirectUrl(returnTo, { success: 'authorized' }));
  } catch (error) {
    console.error('[OAuth Callback] Exception:', error);
    return Response.redirect(buildRedirectUrl('/admin/settings', { error: 'exception', message: error.message }));
  }
}
