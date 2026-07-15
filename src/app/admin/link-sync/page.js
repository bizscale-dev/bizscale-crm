import SyncLinksClient from './SyncLinksClient';
import SyncWebSeoLinksClient from './SyncWebSeoLinksClient';

export const revalidate = 0;

export default function LinkSyncPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="card">
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', margin: 0, marginBottom: '1rem' }}>
          Sync Completed Links
        </h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, marginBottom: '1.5rem' }}>
          Automatically sync completed link counts from your Google Sheet. This updates the task completion status for each client based on the data in your tracking sheet.
        </p>
        <div style={{ padding: '0.75rem', backgroundColor: 'rgba(33, 150, 243, 0.1)', border: '1px solid var(--primary)', borderRadius: '0.5rem', color: 'var(--primary)', fontSize: '0.875rem' }}>
          <strong>📌 Quick Start:</strong> Enter your Google Sheet URL in the "Configure & Sync" section below, then click "Fetch & Update Now" to sync immediately.
        </div>
      </div>

      <SyncLinksClient />

      <SyncWebSeoLinksClient />

      <div className="card">
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          How It Works
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          <div>
            <h3 style={{ margin: 0, marginBottom: '0.5rem', color: 'var(--foreground)' }}>Sheet Format</h3>
            <p style={{ margin: 0, marginBottom: '0.5rem' }}>
              Your Google Sheet should have the following columns (in this exact order):
            </p>
            <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
              <li><strong>Column A:</strong> Client Name (must match exactly with database)</li>
              <li><strong>Column B:</strong> Sheet URL (reference, not used in sync)</li>
              <li><strong>Column C:</strong> Total (reference, calculated total)</li>
              <li><strong>Column D:</strong> Web 2.0 (completed count)</li>
              <li><strong>Column E:</strong> Guest Post (completed count)</li>
              <li><strong>Column F:</strong> PDF Submission (completed count)</li>
              <li><strong>Column G:</strong> Bookmarking (not synced to tasks)</li>
              <li><strong>Column H:</strong> Q/A (not synced to tasks)</li>
              <li><strong>Column I:</strong> Profile Creation (completed count)</li>
              <li><strong>Column J:</strong> Image Submissions (completed count)</li>
              <li><strong>Column K:</strong> Citations/Directory (completed count)</li>
              <li><strong>Column L:</strong> Other (not synced to tasks)</li>
              <li><strong>Column M:</strong> Last Update (for your reference)</li>
            </ul>
          </div>

          <div>
            <h3 style={{ margin: 0, marginBottom: '0.5rem', color: 'var(--foreground)' }}>Synced Link Types</h3>
            <p style={{ margin: 0, marginBottom: '0.5rem' }}>
              Only these columns are synced to update task completion:
            </p>
            <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
              <li>Web 2.0 (Column D)</li>
              <li>Guest Post (Column E)</li>
              <li>PDF Submission (Column F)</li>
              <li>Profile Creation (Column I)</li>
              <li>Image Submissions (Column J)</li>
              <li>Citations/Directory (Column K)</li>
            </ul>
          </div>

          <div>
            <h3 style={{ margin: 0, marginBottom: '0.5rem', color: 'var(--foreground)' }}>URL Configuration</h3>
            <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
              <li><strong>Saved URL:</strong> Click &quot;Edit&quot; above, paste the sheet URL, then &quot;Save as Default&quot; to persist it for future syncs and the daily 11:30 PM (PKT) automation</li>
              <li><strong>Separate from client sync:</strong> This is its own setting, distinct from the Google Sheet used to sync new clients/associates/writers</li>
              <li><strong>Public Access:</strong> Sheet must be shared as &quot;Anyone with the link can view&quot;</li>
            </ul>
          </div>

          <div>
            <h3 style={{ margin: 0, marginBottom: '0.5rem', color: 'var(--foreground)' }}>Troubleshooting</h3>
            <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
              <li><strong>Client not found:</strong> Check that client names in the sheet match exactly with the database</li>
              <li><strong>Sheet not accessible:</strong> Verify the sheet is shared as "Anyone with the link can view"</li>
              <li><strong>No tasks found:</strong> Make sure tasks have been generated in Admin → Tasks first</li>
              <li><strong>View logs:</strong> Check browser console (F12) for detailed sync information</li>
            </ul>
          </div>

          <div>
            <h3 style={{ margin: 0, marginBottom: '0.5rem', color: 'var(--foreground)' }}>Daily Progress Calculation</h3>
            <p style={{ margin: 0, marginBottom: '0.5rem' }}>
              Today's progress is calculated by comparing the sheet totals:
            </p>
            <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
              <li><strong>Formula:</strong> Today's Progress = Sheet Total - Yesterday's Total</li>
              <li><strong>Example:</strong> If sheet shows 30 Web2 links and yesterday had 28, today's progress = 2 new links</li>
              <li><strong>Why:</strong> This ensures you only count links completed today, not the cumulative total</li>
              <li><strong>Note:</strong> If sheet total goes down, today's progress is set to 0 (to prevent negative values)</li>
            </ul>
          </div>

          <div>
            <h3 style={{ margin: 0, marginBottom: '0.5rem', color: 'var(--foreground)' }}>Daily Automation</h3>
            <p style={{ margin: 0 }}>
              System automatically syncs at 11:30 PM (Pakistan Time) daily using the Settings-configured URLs — this includes both the regular SEO Associate sync above and the Web SEO Associate sync below — or you can manually trigger either anytime using the buttons above.
            </p>
          </div>

          <div>
            <h3 style={{ margin: 0, marginBottom: '0.5rem', color: 'var(--foreground)' }}>What Gets Updated</h3>
            <p style={{ margin: 0 }}>
              For today's date, the system updates the <strong>completed_count</strong> field in seo_tasks (regular SEO Associates) and webseo_tasks (Web SEO Associates, using the same today-minus-yesterday delta approach). This instantly updates progress bars and completion status in all dashboards.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
