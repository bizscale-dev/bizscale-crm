import Link from 'next/link';
import SyncLinksClient from './SyncLinksClient';
import SyncWebSeoLinksClient from './SyncWebSeoLinksClient';
import { getRecentSyncLogs } from '@/lib/syncLog';
import { SYNC_TYPE_LABELS, formatLogTime } from './syncLogDisplay';

export const revalidate = 0;

export default async function LinkSyncPage() {
  const syncLogs = await getRecentSyncLogs(20);

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>
            Recent Sync Activity
          </h2>
          <Link href="/admin/link-sync/history" style={{ fontSize: '0.875rem', color: 'var(--primary)', textDecoration: 'none', fontWeight: '500' }}>
            View All →
          </Link>
        </div>
        <p style={{ color: 'var(--text-muted)', margin: 0, marginBottom: '1rem', fontSize: '0.875rem' }}>
          Every trigger run — the twice-daily automatic cron and any manual &quot;Fetch &amp; Update Now&quot; click — is logged here, so you can confirm a trigger actually ran and see what it did without needing to check Vercel&apos;s logs.
        </p>

        {syncLogs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No sync runs recorded yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>Time (PKT)</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Trigger</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Status</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>What Happened</th>
                </tr>
              </thead>
              <tbody>
                {syncLogs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                      {formatLogTime(log.created_at)}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      {SYNC_TYPE_LABELS[log.sync_type] || log.sync_type}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <span
                        style={{
                          padding: '0.15rem 0.5rem',
                          borderRadius: '1rem',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: log.status === 'success' ? '#2e7d32' : '#c62828',
                          backgroundColor: log.status === 'success' ? 'rgba(46, 125, 50, 0.12)' : 'rgba(198, 40, 40, 0.12)',
                        }}
                      >
                        {log.status === 'success' ? 'Success' : 'Error'}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{log.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
              <li><strong>Saved URL:</strong> Click &quot;Edit&quot; above, paste the sheet URL, then &quot;Save as Default&quot; to persist it for future syncs and the daily 5 PM, 7 PM, 9 PM &amp; 11:50 PM (PKT) automation</li>
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
              New progress is calculated by comparing the sheet total against everything already recorded, then
              applied today-first:
            </p>
            <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
              <li><strong>Formula:</strong> New Progress = Sheet Total − Sum of Completed Across All Due Rows</li>
              <li><strong>Today first:</strong> New progress fills today&apos;s own target first, so an associate&apos;s real same-day work is credited to today rather than going toward old debt</li>
              <li><strong>Leftover pays down Pending:</strong> Once today is fully covered, any remaining new progress fills the oldest still-incomplete (&quot;Pending&quot;) day first, then the next, and so on — a Pending task can still clear itself once there&apos;s more than enough to cover both</li>
              <li><strong>Still more left over:</strong> If every due day (today and all overdue) is already at its own target, any remainder is credited to today anyway (can exceed today&apos;s target if there&apos;s genuinely that much extra)</li>
              <li><strong>Note:</strong> If the sheet total goes down, new progress is set to 0 (to prevent negative values)</li>
            </ul>
          </div>

          <div>
            <h3 style={{ margin: 0, marginBottom: '0.5rem', color: 'var(--foreground)' }}>Daily Automation</h3>
            <p style={{ margin: 0 }}>
              System automatically syncs at 5 PM, 7 PM, 9 PM, and 11:50 PM (Pakistan Time) daily using the Settings-configured URLs — this includes the main Client sheet (SEO clients added/removed, funnel progression), the regular SEO Associate completed-links sync above, the Web SEO Associate completed-links sync below, and the Web Clients sheet (Web SEO clients added/removed). Each runs a couple minutes apart to avoid overlapping. You can also manually trigger the completed-links syncs anytime using the buttons above, or the Web Clients import from Admin → Web Clients.
            </p>
          </div>

          <div>
            <h3 style={{ margin: 0, marginBottom: '0.5rem', color: 'var(--foreground)' }}>What Gets Updated</h3>
            <p style={{ margin: 0 }}>
              The system updates the <strong>completed_count</strong> field in seo_tasks (regular SEO Associates) and webseo_tasks (Web SEO Associates) — for whichever day(s) the new sheet progress actually applies to, today first, then the oldest overdue day. This instantly updates progress bars, Pending Tasks, and completion status in all dashboards.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
