# 2 PM Sync Troubleshooting Guide

## Issues Fixed

### 1. **Scheduler Not Starting Automatically**
- **Problem**: The 2 PM cron scheduler wasn't starting when the app initialized
- **Solution**: Updated `src/app/layout.js` to automatically initialize the scheduler on app startup
- **Status**: ✅ Fixed - Scheduler now starts automatically when app boots

### 2. **Google Sheets URL Not Persisting**
- **Problem**: URL had to be entered every time instead of being saved
- **Solution**: Enhanced logging in `src/app/admin/settings/actions.js` to verify database writes
- **Status**: ✅ Verified - Database persistence is working correctly

### 3. **Manual Testing Now Available**
- **Created**: New debug endpoints for testing and verification

## How to Verify Everything is Working

### 1. **Check if URL is Saved**
Go to: `http://localhost:3000/api/debug/check-settings`
- This will show you the currently saved Google Sheets URL
- You should see your URL listed (not "NOT SET")

### 2. **Manually Trigger the 2 PM Sync**
Go to: `http://localhost:3000/api/debug/trigger-sync`
- This will immediately run the sync job
- Check the browser console and server logs for sync results

### 3. **Test Sync from Link Sync Admin Page**
Go to: `/admin/link-sync`
- Click "Edit" to configure the Google Sheets URL (optional - will use saved URL by default)
- Click "Sync Now" or "Fetch & Update Now"
- Should see sync results with client breakdown

## Daily Automatic Sync

The 2 PM sync automatically:

1. **Fetches the saved Google Sheets URL** from the settings database
2. **Calls sync endpoints** for:
   - Client and associate syncing (from "Active Clients" sheet)
   - Completed links tracking (from link type columns)
3. **Updates seo_tasks** with today's completed link counts

### Sync Time
- **Default**: 2 PM UTC (14:00:00 UTC)
- To change: Edit the cron expression in `src/lib/cron-scheduler.js` line 18
- Current: `'0 14 * * *'` (2 PM every day)

## Settings You Need to Configure

### 1. **Google Sheets URL** (Required for sync)
1. Go to: `/admin/settings`
2. Enter your Google Sheet URL in "Google Sheets Configuration"
3. Click "Save Google Sheets URL"
4. Verify it appears under "Configure & Sync" at `/admin/link-sync`

### 2. **Expected Sheet Format**

Your Google Sheet should have:

| Column | Header Name | Example |
|--------|-------------|---------|
| A | Client Name | Acme Corp |
| D | Web 2.0 | 15 |
| E | Guest Post | 12 |
| F | PDF | 18 |
| I | Profile Creation | 20 |
| K | Citations/Directory | 19 |
| J | Image Submissions | 14 |

The system uses **flexible column matching** - it looks for headers containing:
- "client" → Client Name column
- "web" + "2" → Web 2.0 column
- "guest" → Guest Post column
- "pdf" → PDF column
- "profile" → Profile Creation column
- "citation" or "directory" → Citations column
- "image" → Image Submissions column

## Logs to Monitor

### Server Console/Logs
When the 2 PM sync runs, you should see logs like:

```
[CRON] Running 2 PM sync at 2024-06-29T14:00:00Z
[CRON] Found 1 active campaign(s), syncing each one...
[CRON] Syncing from sheet: https://docs.google.com/spreadsheets/d/...
[SYNC] Headers found: ['Client Name', 'Web 2.0', 'Guest Post', ...]
[SYNC] Updated Client1 - web2: 5 (sheet: 15, yesterday: 10)
[SYNC] Complete: 6 records synced from 3 clients
```

### Common Log Messages

| Log | Meaning |
|-----|---------|
| `[CRON] No active campaigns` | No campaign marked as active in database |
| `[CRON] No Google Sheets URL configured` | URL not saved in settings |
| `[SYNC] Client not found: "Name"` | Client name in sheet doesn't match database |
| `[SYNC] Missing columns:` | Sheet headers don't match expected names |

## Quick Checklist

- [ ] App has started (scheduler auto-initializes)
- [ ] Google Sheets URL is saved in `/admin/settings`
- [ ] Sheet is publicly shared ("Anyone with link can view")
- [ ] Sheet has correct column headers
- [ ] Client names in sheet match database exactly
- [ ] Active campaign exists in database
- [ ] Can manually trigger sync from `/api/debug/trigger-sync`
- [ ] Sync results show up at `/admin/link-sync`
- [ ] 2 PM sync job is auto-running (check logs)

## Debugging Steps

If sync isn't working:

1. **Check if URL is saved**
   - Visit: `/api/debug/check-settings`
   - Should show your URL (not "NOT SET")

2. **Test manual sync**
   - Visit: `/api/debug/trigger-sync`
   - Check server logs for errors

3. **Check sheet accessibility**
   - Share your sheet as "Anyone with link can view"
   - Verify URL is in correct format
   - Try sync from `/admin/link-sync`

4. **Verify column names**
   - Use exact column headers from format above
   - Check sheet has data rows (not just headers)

5. **Check campaign is active**
   - Go to `/admin/campaign`
   - Verify at least one campaign has status "active"

## Files Modified

- `src/app/layout.js` - Auto-start scheduler
- `src/app/admin/settings/actions.js` - Added logging
- `src/app/api/debug/check-settings/route.js` - New debug endpoint
- `src/app/api/debug/trigger-sync/route.js` - New debug endpoint

## Support

If you need to manually restart the scheduler without restarting the app:
- Visit: `/api/scheduler/start` (will reinitialize if needed)

If you need to change the sync time:
- Edit `src/lib/cron-scheduler.js` line 18
- Cron format: `'minute hour * * *'` (UTC)
- Example for 3 PM: `'0 15 * * *'`
