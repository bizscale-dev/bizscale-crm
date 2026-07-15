# How to Share Your Google Sheet for Import

## Quick Steps (30 seconds):

1. **Open your Google Sheet** in Google Sheets
2. Click the **blue "Share" button** (top right corner)
3. In the sharing dialog, click **"Change"** next to "Restricted"
4. Select **"Anyone with the link"**
5. Make sure **"Viewer"** is selected (not Editor)
6. Click **"Share"** or **"Copy link"**
7. **Back in BizScale CRM**, paste the link in the import form
8. Click **"Preview Data"**

---

## Visual Guide:

### Step 1: Click Share Button
```
┌─────────────────────────────────┐
│ Google Sheet                    │
│                         [Share] │ ← Click here
└─────────────────────────────────┘
```

### Step 2: Change Sharing Settings
```
Sharing Settings:
├─ [Change] Restricted ← Click "Change"
│  └─ Anyone with the link ← Select this
│  └─ Viewer (Don't Edit) ← Keep this
└─ [Share] [Copy link]
```

### Step 3: Paste in BizScale CRM
```
┌─────────────────────────────────────────────┐
│ Google Sheet URL                            │
│ https://docs.google.com/spreadsheets/d/... │
│                     [Preview Data] [Import] │
└─────────────────────────────────────────────┘
```

---

## Why Share as "Anyone with the link can view"?

- ✅ **Simple** - One click to enable
- ✅ **Secure** - Only people with the exact link can view
- ✅ **No account needed** - Anyone can view, don't need Google account
- ✅ **Stays private** - Not indexed by search engines
- ✅ **Safe** - Set to "Viewer" so they can't edit

---

## Troubleshooting

### "Could not access the sheet" Error?
- ❌ Sheet is probably still "Restricted"
- ✅ Follow steps above to share as "Anyone with the link"
- ✅ Make sure "Viewer" is selected (not Editor or Commenter)

### "Invalid Google Sheets URL" Error?
- ❌ URL might be wrong or not a Google Sheets link
- ✅ Make sure you're copying from the browser address bar
- ✅ URL should contain `/spreadsheets/d/` in it

### "No clients found in the selected column" Error?
- ❌ Column letter is wrong or data is empty
- ✅ Check that Column C (or your selected column) has client names
- ✅ Make sure "First row is a header" is checked if row 1 is a header

---

## Tips for Best Results

1. **Format your data simply:**
   - Column A: Client Names
   - Column B: Websites (optional)
   - Row 1: Headers (like "Name", "Website")

2. **Example Sheet Layout:**
   ```
   A          | B
   -----------|----------
   Name       | Website
   -----------|----------
   Client 1   | example.com
   Client 2   | test.com
   Client 3   | abc.com
   ```

3. **Then in the import form:**
   - Google Sheet URL: (your sheet URL)
   - Client name column: **A**
   - Website column: **B**
   - ☑ First row is a header (skip it)
   - Click **Preview Data**

That's it! You should see your clients in the preview table.

---

## Still Having Issues?

1. **Restart the app**: `npm run dev`
2. **Check internet connection**: Make sure you can access Google Sheets normally
3. **Try a different sheet**: Create a test sheet to verify it works
4. **Check column letters**: Make sure you're using the right column (A, B, C, etc.)

