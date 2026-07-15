import { getDb } from '@/lib/db';
import { verifySession } from '@/lib/session';

// Testing helper: push a funnel client's current month-end date into the past so the
// next sync-funnel-progression run advances/graduates them without waiting real days.
export async function POST(request) {
  try {
    const session = await verifySession();

    if (!session || session.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { clientId, daysBack } = await request.json();

    if (!clientId || !daysBack) {
      return Response.json({ error: 'clientId and daysBack are required' }, { status: 400 });
    }

    const db = await getDb();
    const client = await db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);

    if (!client) {
      return Response.json({ error: 'Client not found' }, { status: 404 });
    }

    if (client.tunnel_status !== 'active' || !client.funnel_month_end_date) {
      return Response.json({ error: 'Client is not currently active in the funnel' }, { status: 400 });
    }

    const shifted = new Date(client.funnel_month_end_date);
    shifted.setDate(shifted.getDate() - Number(daysBack));
    const newEndDate = shifted.toISOString().split('T')[0];

    await db.prepare('UPDATE clients SET funnel_month_end_date = ? WHERE id = ?').run(newEndDate, clientId);

    return Response.json({ success: true, clientId, previousEndDate: client.funnel_month_end_date, newEndDate });
  } catch (err) {
    console.error('[DEBUG] fast-forward-funnel error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
