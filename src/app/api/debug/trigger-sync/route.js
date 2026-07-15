import { verifySession } from '@/lib/session';
import { triggerSyncNow } from '@/lib/cron-scheduler';

export async function GET(request) {
  try {
    const session = await verifySession();
    
    if (!session || session.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    console.log('[DEBUG] Manual sync triggered by', session.name);
    
    // Trigger the sync job immediately
    await triggerSyncNow();

    return Response.json({
      success: true,
      message: 'Sync triggered successfully',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[DEBUG] Sync error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  return GET(request);
}
