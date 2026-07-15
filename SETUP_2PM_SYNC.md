# Setting Up 2 PM Automatic Sync - Step by Step

## What's Happening

Every day at **2 PM UTC**, the system automatically:
1. Fetches your saved Google Sheets URL
2. Reads completed link data from your sheet
3. Updates all associate tasks with today's completed links
4. No manual action needed after initial setup!

## Setup Steps

### Step 1: Prepare Your Google Sheet

1. Open your Google Sheet
2. Go to **File → Share** (or click Share button)
3. Change sharing to **"Anyone with the link"** (view access)
4. Copy the shareable link

Example format:
```
https://docs.google.com/spreadsheets/d/1ayBW1hD_UtpfBCs5IGD7wEhjAx3C79OEBn2XpkQbXZA/edit
```

### Step 2: Add Correct Column Headers

Your sheet **must have** these exact column headers (in any order):

| Header | Purpose |
|--------|---------|
| Client Name | Associate will work on this client |
| Web 2.0 | Number of Web 2.0 links completed |
| Guest Post | Number of Guest Post links completed |
| PDF | Number of PDF submission links completed |
| Profile Creation | Number of Profile creation links completed |
| Citations/Directory | Number of Citations/Directory links completed |
| Image Submissions | Number of Image submission links completed |

**Example Row:**
| Client Name | Web 2.0 | Guest Post | PDF | Profile Creation | Citations/Directory | Image Submissions |
|---|---|---|---|---|---|---|
| Acme Corp | 15 | 12 | 18 | 20 | 19 | 14 |

### Step 3: Save URL in Admin Settings

1. Log in as **Admin** to the CRM
2. Go to: **Admin Dashboard → Settings** (left sidebar)
3. Scroll to **"Google Sheets Configuration"** section
4. Paste your Google Sheet URL
5. Click **"Save Google Sheets URL"**

You should see: "✓ Google Sheets URL saved successfully"

### Step 4: Verify It Saved

Check the debug page:
- Visit: `http://localhost:3000/api/debug/check-settings`
- You should see your URL listed
- If you see "NOT SET", the save didn't work

### Step 5: Test the Sync

#### Option A: Manual Test from Admin
1. Go to: **Admin Dashboard → Sync Completed Links**
2. Click **"Sync Now"** button
3. Watch for results showing synced clients

#### Option B: Trigger Manually via API
- Visit: `http://localhost:3000/api/debug/trigger-sync`
- Should return success and sync results

#### Option C: Check Logs
- Look at server console for logs starting with `[CRON]` or `[SYNC]`
- Should see sync running at 2 PM UTC

### Step 6: Verify Every Day

After you set it up:
1. Check that sync happens at 2 PM UTC
2. Visit `/admin/link-sync` to see sync results
3. Associates' progress bars should update automatically

## How to Know It's Working

### Green Lights ✅

- ✅ Google Sheets URL shows at `/api/debug/check-settings`
- ✅ Manual sync from `/admin/link-sync` succeeds
- ✅ Sync results show client names and link counts
- ✅ Server logs show `[CRON]` messages at sync time
- ✅ Associates see updated progress on their dashboard

### Red Lights ❌

- ❌ URL shows "NOT SET" at debug endpoint
- ❌ Manual sync says "URL not configured"
- ❌ Sheet has wrong column names
- ❌ No `[CRON]` logs appearing (scheduler not running)
- ❌ Client names don't match (case sensitive!)

## Time Zone Note

The 2 PM sync runs at **2 PM UTC (Coordinated Universal Time)**

If you need a different time:
1. Contact admin to change the schedule
2. Cron expression is in: `src/lib/cron-scheduler.js` line 18
3. Current: `'0 14 * * *'` (14:00 = 2 PM UTC)

**Time Zone Conversions:**
- 2 PM UTC = 10 AM EDT (US Eastern)
- 2 PM UTC = 9 AM CDT (US Central)
- 2 PM UTC = 7 AM PDT (US Pacific)
- 2 PM UTC = 7 PM PKT (Pakistan)
- 2 PM UTC = 8 PM IST (India)

## Common Issues & Fixes

### Issue: "URL not configured" on sync

**Fix**: Save URL in `/admin/settings` → restart server

### Issue: "Client not found"

**Fix**: 
- Check client names are EXACTLY the same in sheet and database
- Names are **case-sensitive**
- Remove extra spaces

### Issue: "Missing required link type columns"

**Fix**:
- Verify sheet has all 6 column headers
- Spelling must be exact (case doesn't matter for headers)
- Headers: Web 2.0, Guest Post, PDF, Profile Creation, Citations/Directory, Image Submissions

### Issue: Sheet not accessible

**Fix**:
1. Go to sheet → Share button
2. Change to **"Anyone with the link can view"**
3. Copy the NEW link if changed
4. Update URL in `/admin/settings`

### Issue: Sync showing 0 records updated

**Possible Causes**:
- All tasks already match the sheet values (no change needed)
- Sheet column headers not found
- Client names don't match

**Debug**: 
- Go to `/admin/link-sync`
- Try "Sync Now"
- Look at "Warnings" section for client names that didn't match

## Next Steps

1. ✅ Set up your Google Sheet with correct headers
2. ✅ Share the sheet as "Anyone with link"
3. ✅ Save the URL in `/admin/settings`
4. ✅ Test manual sync from `/admin/link-sync`
5. ✅ Check that sync happens automatically at 2 PM UTC
6. ✅ Monitor `/admin/link-sync` to see daily results

## Still Need Help?

Check the detailed troubleshooting guide: `SYNC_TROUBLESHOOTING.md`

Or check live logs:
- **Debug endpoint**: `/api/debug/check-settings`
- **Manual sync**: `/api/debug/trigger-sync`
- **Sync results**: `/admin/link-sync`
