# Google Sheets API Setup Guide - Secure Method

## ⚠️ IMPORTANT: Use Service Account (Recommended)

This project now uses **Service Account Authentication** for maximum security.

**See `API_SETUP_QUICK_START.md` for a 5-minute quick start!**

Or see `SERVICE_ACCOUNT_SETUP.md` for detailed instructions.

---

## Why Service Account?

| Method | Security | Setup | Sharing | API Key |
|--------|----------|-------|---------|---------|
| **Service Account** ✅ | Highest | 5 min | No | Yes |
| Public CSV Export | Medium | 2 min | Required | No |
| API Key Only | Low | 1 min | Required | Yes |

---

## What is a Service Account?

A **service account** is like a bot account for your app:
- No password to steal
- Only has permissions you give it
- Server-side only (never exposed to browser)
- Automatically authenticated via private key

---

## The Flow

1. **You create service account** in Google Cloud
2. **You share your sheet** with that service account
3. **Your app uses it** to fetch sheet data securely
4. **No public sharing** needed

---

## Environment Variables

### `.env.local` Format
```
GOOGLE_SERVICE_ACCOUNT_JSON={"type": "service_account", "project_id": "...", ...full json...}
```

This entire JSON from Google Cloud goes in ONE line in your `.env.local` file.

---

## Files to Read

1. **Quick Start** → `API_SETUP_QUICK_START.md` (5 min setup)
2. **Detailed** → `SERVICE_ACCOUNT_SETUP.md` (full walkthrough)
3. **Share Sheet** → `SHARE_GOOGLE_SHEET.md` (step 3 of setup)

---

## Questions?

- Lost JSON file? Create a new one in Google Cloud → Credentials → Add Key
- Can't find service account? Check Google Cloud Console → Service Accounts
- Sheet not found? Copy URL from browser address bar exactly

