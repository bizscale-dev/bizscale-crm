# Quick Start: Secure API-Based Google Sheets Import

## ⚡ 5-Minute Setup

### Step 1: Get Service Account JSON (2 min)
1. Go: https://console.cloud.google.com/
2. Create project "BizScale CRM" (if new)
3. Enable **Google Sheets API** (APIs & Services → Library → Search → Enable)
4. Go to **Credentials** → **+ Create Credentials** → **Service Account**
5. Name: `bizscale-crm`, click **CREATE AND CONTINUE** → **DONE**
6. Click your service account, go to **Keys** tab
7. **Add Key** → **JSON** → **CREATE**
8. JSON file downloads

### Step 2: Add to Project (1 min)
1. Open the JSON file with text editor
2. Copy **entire content** (starts with `{`, ends with `}`)
3. Open `.env.local` in your project
4. Replace the placeholder with:
```
GOOGLE_SERVICE_ACCOUNT_JSON={paste_entire_json_here}
```

### Step 3: Share Sheet with Service Account (2 min)
1. In the JSON file, find `"client_email": "...@iam.gserviceaccount.com"`
2. Copy that email
3. Open your Google Sheet
4. **Share** button → Paste email → **Viewer** access → **Share**
5. ✅ Done!

### Step 4: Test (optional)
1. Restart dev server: `npm run dev`
2. Admin → Clients → Import from Google Sheet
3. Paste your sheet URL
4. Click **Preview Data**
5. Should work! ✅

---

## What You Get

- ✅ **No public sharing** - Sheet stays completely private
- ✅ **Secure API** - OAuth2 server-side authentication
- ✅ **Works offline** - No internet required after setup
- ✅ **Automatic** - One-time setup, then just paste URL
- ✅ **Better security** - Private key never exposed

---

## File Structure

```
.env.local  ← Your secret service account JSON (gitignored)
            ← Never commit this file!
```

---

## Troubleshooting

### "permission_denied"
- Forgot to share sheet with service account email
- Go back to Step 3

### "Invalid JSON"
- Make sure you copied the ENTIRE JSON
- Should start with `{` and end with `}`
- No line breaks in middle

### "Sheet not found"
- Wrong URL or typo
- Paste URL exactly as shown in browser

---

## Security Checklist

- ✅ `.env.local` is in `.gitignore` (never uploaded)
- ✅ Service account = bot-only (no password)
- ✅ Private key stays on your server
- ✅ Sheet shared only with service account
- ✅ API uses encrypted HTTPS

---

## More Info

See `SERVICE_ACCOUNT_SETUP.md` for detailed step-by-step with more options.
