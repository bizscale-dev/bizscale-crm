/**
 * GET /api/debug/writer-tasks-status
 * Check current writer task status and attempt generation
 */
import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import { generateWriterTasks } from '@/lib/writerTaskGenerator';

export async function GET(request) {
  try {
    const db = await getDb();
    const campaign = await getActiveCampaign();

    if (!campaign) {
      return Response.json({ error: 'No active campaign' }, { status: 400 });
    }

    // Check writers in campaign
    const writers = await db.prepare(`
      SELECT DISTINCT u.id, u.name
      FROM users u
      JOIN writer_assignments wa ON wa.user_id = u.id
      WHERE wa.campaign_id = ? AND u.is_active = 1
    `).all(campaign.id);

    // Check clients with writers
    const clientsWithWriters = await db.prepare(`
      SELECT c.id, c.name, u.name as writer_name
      FROM clients c
      JOIN users u ON u.id = c.assigned_writer_id
      WHERE c.campaign_id = ? AND c.is_active = 1 AND c.assigned_writer_id IS NOT NULL
    `).all(campaign.id);

    // Check existing tasks
    const existingTasks = await db.prepare(`
      SELECT COUNT(*) as total FROM writing_tasks WHERE campaign_id = ?
    `).get(campaign.id);

    // Try to generate tasks
    let generationResult = null;
    let generationError = null;

    try {
      console.log('[debug] Attempting to generate writer tasks...');
      generationResult = await generateWriterTasks(campaign.id);
      console.log('[debug] Generation succeeded:', generationResult);
    } catch (err) {
      generationError = err.message;
      console.error('[debug] Generation failed:', err.message, err.stack);
    }

    // Check tasks after generation
    const tasksAfter = await db.prepare(`
      SELECT COUNT(*) as total FROM writing_tasks WHERE campaign_id = ?
    `).get(campaign.id);

    return Response.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        total_days: campaign.total_days,
        posts_per_client: campaign.posts_per_client,
        writer_clients_per_day: campaign.writer_clients_per_day,
      },
      status: {
        writersInCampaign: writers.length,
        writers: writers.map(w => ({ id: w.id, name: w.name })),
        clientsWithWriters: clientsWithWriters.length,
        clientsDetail: clientsWithWriters.slice(0, 10),
        tasksBeforeGeneration: existingTasks.total,
        tasksAfterGeneration: tasksAfter.total,
        generationResult,
        generationError,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}
