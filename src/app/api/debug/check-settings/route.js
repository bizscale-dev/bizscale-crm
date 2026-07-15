import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';

export async function GET(request) {
  try {
    const session = await verifySession();
    
    if (!session || session.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const db = await getDb();

    // Check all settings
    const allSettings = await db.prepare("SELECT * FROM settings").all();
    
    // Specifically check for google_sheets_url and completed_links_sheet_url
    const sheetUrl = await db.prepare("SELECT value FROM settings WHERE key = ?").get('google_sheets_url');
    const completedLinksUrl = await db.prepare("SELECT value FROM settings WHERE key = ?").get('completed_links_sheet_url');
    const webSeoCompletedLinksUrl = await db.prepare("SELECT value FROM settings WHERE key = ?").get('web_seo_completed_links_sheet_url');

    return Response.json({
      success: true,
      googleSheetsUrl: sheetUrl?.value || 'NOT SET',
      completedLinksSheetUrl: completedLinksUrl?.value || 'NOT SET',
      webSeoCompletedLinksSheetUrl: webSeoCompletedLinksUrl?.value || 'NOT SET',
      allSettings: allSettings.map(s => ({ key: s.key, value: s.value.substring(0, 50) + (s.value.length > 50 ? '...' : '') }))
    });
  } catch (err) {
    console.error('[DEBUG] Error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
