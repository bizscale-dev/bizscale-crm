'use server';

import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';

export async function updatePassword(prevState, formData) {
  const db = await getDb();
  const session = await verifySession();
  if (!session) return { error: 'Not authenticated' };

  const current_password = formData.get('current_password');
  const new_password = formData.get('new_password');
  const confirm_password = formData.get('confirm_password');

  if (new_password !== confirm_password) {
    return { error: 'New passwords do not match' };
  }
  if (!new_password || new_password.length < 6) {
    return { error: 'New password must be at least 6 characters' };
  }

  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(session.userId);
  if (!user) return { error: 'User not found' };

  if (!bcrypt.compareSync(current_password, user.password)) {
    return { error: 'Current password is incorrect' };
  }

  const hash = bcrypt.hashSync(new_password, 10);
  await db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, session.userId);
  revalidatePath('/admin/settings');
  return { success: 'Password updated successfully' };
}

export async function disconnectGoogleAccount() {
  const db = await getDb();
  const session = await verifySession();
  if (!session) return { error: 'Not authenticated' };

  try {
    await db.prepare('DELETE FROM google_oauth_tokens WHERE user_id IS NULL').run();
    revalidatePath('/admin/settings');
    return { success: 'Google account disconnected' };
  } catch (error) {
    return { error: error.message };
  }
}

export async function updateGoogleSheetsUrl(prevState, formData) {
  const db = await getDb();
  const session = await verifySession();
  
  if (!session) {
    return { error: 'Not authenticated' };
  }

  const sheetUrl = formData.get('sheet_url')?.trim();

  if (!sheetUrl) {
    return { error: 'Google Sheets URL is required' };
  }

  if (!sheetUrl.includes('docs.google.com/spreadsheets')) {
    return { error: 'Invalid Google Sheets URL' };
  }

  try {
    console.log('[SETTINGS] Saving Google Sheets URL:', sheetUrl);
    
    // Check if setting exists
    const existing = await db.prepare("SELECT key FROM settings WHERE key = ?").get('google_sheets_url');
    
    if (existing) {
      console.log('[SETTINGS] Updating existing URL');
      await db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(sheetUrl, 'google_sheets_url');
    } else {
      console.log('[SETTINGS] Inserting new URL');
      await db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run('google_sheets_url', sheetUrl);
    }

    // Verify it was saved
    const verify = await db.prepare("SELECT value FROM settings WHERE key = ?").get('google_sheets_url');
    console.log('[SETTINGS] Verification - Saved URL:', verify?.value);

    revalidatePath('/admin/settings');
    return { success: 'Google Sheets URL saved successfully' };
  } catch (error) {
    console.error('Settings update error:', error);
    return { error: error.message };
  }
}

// Separate from 'google_sheets_url' (used for the client/associate/writer assignment
// sync) — this is the sheet the "Sync Completed Links" feature reads link-completion
// counts from, which has an entirely different column format.
export async function updateCompletedLinksSheetUrl(prevState, formData) {
  const db = await getDb();
  const session = await verifySession();

  if (!session) {
    return { error: 'Not authenticated' };
  }

  const sheetUrl = formData.get('sheet_url')?.trim();

  if (!sheetUrl) {
    return { error: 'Google Sheets URL is required' };
  }

  if (!sheetUrl.includes('docs.google.com/spreadsheets')) {
    return { error: 'Invalid Google Sheets URL' };
  }

  try {
    const existing = await db.prepare("SELECT key FROM settings WHERE key = ?").get('completed_links_sheet_url');

    if (existing) {
      await db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(sheetUrl, 'completed_links_sheet_url');
    } else {
      await db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run('completed_links_sheet_url', sheetUrl);
    }

    revalidatePath('/admin/link-sync');
    return { success: 'Completed Links sheet URL saved successfully' };
  } catch (error) {
    console.error('Settings update error:', error);
    return { error: error.message };
  }
}

// Separate again from 'completed_links_sheet_url' — this is the sheet the Web SEO
// Associate task sync reads from, which tracks web2/guest-post link counts per
// web client rather than the regular SEO associates' link types.
export async function updateWebSeoCompletedLinksSheetUrl(prevState, formData) {
  const db = await getDb();
  const session = await verifySession();

  if (!session) {
    return { error: 'Not authenticated' };
  }

  const sheetUrl = formData.get('sheet_url')?.trim();

  if (!sheetUrl) {
    return { error: 'Google Sheets URL is required' };
  }

  if (!sheetUrl.includes('docs.google.com/spreadsheets')) {
    return { error: 'Invalid Google Sheets URL' };
  }

  try {
    const existing = await db.prepare("SELECT key FROM settings WHERE key = ?").get('web_seo_completed_links_sheet_url');

    if (existing) {
      await db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(sheetUrl, 'web_seo_completed_links_sheet_url');
    } else {
      await db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run('web_seo_completed_links_sheet_url', sheetUrl);
    }

    revalidatePath('/admin/link-sync');
    return { success: 'Web SEO Completed Links sheet URL saved successfully' };
  } catch (error) {
    console.error('Settings update error:', error);
    return { error: error.message };
  }
}
