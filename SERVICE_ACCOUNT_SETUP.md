# Service Account Setup for Google Sheets API (Most Secure Method)

## Why Service Account?

- ✅ **No sharing needed** - API can access your sheets directly
- ✅ **More secure** - Uses server-side authentication
- ✅ **Private sheets** - Works with sheets you own
- ✅ **Automated** - No manual sharing steps needed

---

## Step-by-Step Setup

### Step 1: Go to Google Cloud Console
1. Visit: https://console.cloud.google.com/
2. Create a new project called "BizScale CRM" (if you haven't already)
3. Select that project

### Step 2: Enable Google Sheets API
1. Go to **APIs & Services** → **Library**
2. Search for "Google Sheets API"
3. Click it and press **ENABLE**

### Step 3: Create a Service Account
1. Go to **APIs & Services** → **Credentials**
2. Click **"+ Create Credentials"** → **"Service Account"**
3. Fill in the form:
   - Service account name: `bizscale-crm`
   - Description: `BizScale CRM Google Sheets Integration`
   - Click **CREATE AND CONTINUE**
4. Skip the optional steps, click **DONE**

### Step 4: Create a Service Account Key
1. In the Credentials page, find your service account `bizscale-crm`
2. Click on it to open details
3. Go to the **"Keys"** tab
4. Click **"Add Key"** → **"Create new key"**
5. Choose **JSON** format
6. Click **CREATE**
7. A JSON file will download automatically

### Step 5: Add to Your Project
1. Open the downloaded JSON file with a text editor
2. **Copy the entire JSON content**
3. Paste it into your `.env.local` file as:

```
GOOGLE_SERVICE_ACCOUNT_JSON={paste_entire_json_here}
```

Example:
```
GOOGLE_SERVICE_ACCOUNT_JSON={"type": "service_account", "project_id": "bizscale-crm", ...rest of json...}
```

### Step 6: Share Sheet with Service Account
1. In the JSON file, find the **"client_email"** field
   - It looks like: `bizscale-crm@bizscale-crm-123456.iam.gserviceaccount.com`
2. Copy this email
3. Go to your Google Sheet
4. Click **"Share"** button
5. Paste that email address
6. Give it **"Viewer"** access
7. Uncheck "Notify people" (it's a bot account)
8. Click **"Share"**

---

## Result in `.env.local`

Your `.env.local` should look like:
```
GOOGLE_SERVICE_ACCOUNT_JSON={"type": "service_account", "project_id": "bizscale-crm-xyz", "private_key_id": "...", "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n", "client_email": "bizscale-crm@bizscale-crm-xyz.iam.gserviceaccount.com", "client_id": "...", "auth_uri": "https://accounts.google.com/o/oauth2/auth", "token_uri": "https://oauth2.googleapis.com/token", "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs"}
```

---

## Security Notes

- ✅ `.env.local` is in `.gitignore` (never committed)
- ✅ Service account is bot-only (no human login)
- ✅ Can restrict permissions per sheet
- ✅ Private key never leaves your server
- ✅ API calls are encrypted

---

## Troubleshooting

### "permission_denied" Error?
- Forgot to share sheet with service account email
- Share your sheet with the `client_email` from your JSON

### "Invalid JSON" Error?
- Make sure you copied the ENTIRE JSON (including outer braces)
- No line breaks in the middle
- Should start with `{` and end with `}`

### Can't find JSON file?
- Check your Downloads folder
- File name: `bizscale-crm-xxxxx.json`
- If lost, create new key in Google Cloud

---

## That's It!

Once done, restart your dev server and try the import again. The API will now use the service account to securely access your sheets without any sharing!

