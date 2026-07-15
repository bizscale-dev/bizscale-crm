// The daily sync now runs via Vercel Cron hitting /api/cron/daily-sync (see vercel.json)
// instead of an in-process node-cron scheduler, which can't survive on serverless.
// This route is kept as a no-op for backward compatibility with any existing bookmarks.
export async function GET() {
  return Response.json({
    success: true,
    message: 'Sync scheduling is now handled by Vercel Cron (/api/cron/daily-sync). Nothing to start here.',
  });
}
