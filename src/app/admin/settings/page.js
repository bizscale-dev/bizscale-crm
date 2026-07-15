import { getDb } from '@/lib/db';
import PasswordForm from './PasswordForm';
import GoogleSheetsUrlForm from './GoogleSheetsUrlForm';
import GoogleAuthConnection from './GoogleAuthConnection';

export const revalidate = 0; // Disable caching for real-time data

export default async function SettingsPage() {
  const db = await getDb();

  // Get current Google Sheets URL if set
  let currentSheetUrl = '';
  try {
    const settings = await db.prepare("SELECT value FROM settings WHERE key = ?").get('google_sheets_url');
    currentSheetUrl = settings?.value || '';
  } catch (e) {
    console.error('Error fetching settings:', e);
  }

  // Get Google OAuth connection status (single shared account for the whole app)
  let googleConnected = false;
  let googleConnectedAt = null;
  try {
    const token = await db.prepare('SELECT created_at FROM google_oauth_tokens WHERE user_id IS NULL ORDER BY id DESC LIMIT 1').get();
    googleConnected = !!token;
    googleConnectedAt = token?.created_at || null;
  } catch (e) {
    console.error('Error fetching Google connection status:', e);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="card" style={{ maxWidth: '600px' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          Google Account Connection
        </h2>

        <GoogleAuthConnection isConnected={googleConnected} connectedAt={googleConnectedAt} />
      </div>

      <div className="card" style={{ maxWidth: '600px' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          Google Sheets Configuration
        </h2>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Add your Google Sheets URL here. This sheet will be used for automatic client and associate syncing.
        </p>

        <GoogleSheetsUrlForm currentUrl={currentSheetUrl} />
      </div>

      <div className="card" style={{ maxWidth: '600px' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          Account Settings
        </h2>
        
        <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Change Password</h3>
        <PasswordForm />
      </div>
    </div>
  );
}
