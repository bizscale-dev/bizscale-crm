# OAuth 2.0 Setup for Google Sheets Import

## Why OAuth 2.0?

- ✅ **No service accounts** - Works with personal/org Google accounts
- ✅ **User permission** - User authorizes access themselves
- ✅ **More secure** - No keys stored permanently
- ✅ **Organization approved** - Uses standard OAuth flow
- ✅ **Auditable** - Google logs all access

---

## Step 1: Get Your OAuth 2.0 Credentials

### From Google Cloud Console:
1. Go to: https://console.cloud.google.com/
2. Select your project (BizScale CRM)
3. Go to **APIs & Services** → **Credentials**
4. Click **+ Create Credentials** → **OAuth client ID**
5. If prompted, configure consent screen first:
   - User Type: **Internal** (or External if needed)
   - App name: **BizScale CRM**
   - User support email: your email
   - Click **Save & Continue** → **Save & Continue** again
6. Back to credentials:
   - Application type: **Web application**
   - Name: **BizScale CRM**
   - Authorized redirect URIs: `http://localhost:3000/api/auth/google/callback`
   - Click **CREATE**
7. You'll see your credentials:
   - **Client ID**: Copy this
   - **Client Secret**: Copy this
8. Click **Download JSON** and save it

---

## Step 2: Add to `.env.local`

```
GOOGLE_OAUTH_CLIENT_ID=your_client_id_here
GOOGLE_OAUTH_CLIENT_SECRET=your_client_secret_here
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

### For Production:
When deploying, also add:
```
GOOGLE_OAUTH_REDIRECT_URI=https://yourdomain.com/api/auth/google/callback
```

---

## Step 3: How It Works

### First Time:
1. User clicks "Import from Google Sheet"
2. System shows: "Click here to authorize with Google"
3. User is redirected to Google login
4. User grants permission to access sheets
5. System gets access token & stores it (encrypted)
6. User can now import sheets

### After Authorization:
1. User just needs to paste sheet URL
2. Click "Preview Data"
3. System uses stored access token to fetch data
4. Works automatically!

---

## Step 4: Revoke Access (Anytime)

If user wants to disconnect:
1. Go to: https://myaccount.google.com/permissions
2. Find "BizScale CRM"
3. Click it → **Remove**
4. Done! Next import will ask for permission again

---

## Security Notes

- ✅ Access tokens are temporary (1 hour)
- ✅ Refresh tokens are encrypted in database
- ✅ No passwords stored
- ✅ User can revoke anytime
- ✅ Each user has their own token

---

## Multiple Users

If multiple people in your org need to import:
- Each person logs in with their own Google account
- Each gets their own access token
- Each can access only sheets they have permission to view
- Perfect for organization use!

---

## Troubleshooting

### "Redirect URI mismatch"
- Make sure `GOOGLE_OAUTH_REDIRECT_URI` matches exactly in Google Cloud Console
- For local dev: `http://localhost:3000/api/auth/google/callback`
- For production: Use your actual domain

### "Client ID not found"
- Check `.env.local` has `GOOGLE_OAUTH_CLIENT_ID`
- Make sure you copied the full ID (starts with numbers...@...apps.googleusercontent.com)
- Restart dev server

### User sees "Access Denied"
- User might not have permission to that sheet
- Or the sheet doesn't exist
- Ask sheet owner to share with the user first

---

## Environment Variables Needed

```
GOOGLE_OAUTH_CLIENT_ID=12345.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

---

## Next Steps

1. Get Client ID and Secret from Google Cloud
2. Add to `.env.local`
3. Restart dev server
4. Try importing a sheet - you'll be prompted to authorize

That's it! OAuth 2.0 is now active.
