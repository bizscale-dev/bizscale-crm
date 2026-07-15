import { getDb } from '@/lib/db';
import { getActiveCampaign } from '@/lib/services';
import { generateWriterTasks } from '@/lib/writerTaskGenerator';

export async function GET(request) {
  try {
    const db = await getDb();
    const campaign = await getActiveCampaign();

    if (!campaign) {
      return Response.json({
        error: 'No active campaign',
        debug: {
          allCampaigns: await db.prepare('SELECT id, name, status FROM campaigns').all()
        }
      }, { status: 400 });
    }

    // Check writers assigned
    const writers = await db.prepare(`
      SELECT u.id, u.name
      FROM users u
      JOIN writer_assignments wa ON wa.user_id = u.id
      WHERE wa.campaign_id = ? AND u.is_active = 1
    `).all(campaign.id);

    // Check clients with writers assigned
    const clientsWithWriters = await db.prepare(`
      SELECT c.id, c.name, c.assigned_writer_id, u.name as writer_name
      FROM clients c
      LEFT JOIN users u ON u.id = c.assigned_writer_id
      WHERE c.campaign_id = ? AND c.is_active = 1
      ORDER BY u.name, c.name
    `).all(campaign.id);

    // Try to generate tasks
    let taskResult = null;
    let generationError = null;

    try {
      taskResult = await generateWriterTasks(campaign.id);
    } catch (err) {
      generationError = err.message;
    }

    // Check if tasks were created
    const createdTasks = await db.prepare(`
      SELECT COUNT(*) as total FROM writing_tasks WHERE campaign_id = ?
    `).get(campaign.id);

    return Response.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        total_days: campaign.total_days,
        start_date: campaign.start_date,
        posts_per_client: campaign.posts_per_client,
        writer_clients_per_day: campaign.writer_clients_per_day,
        writers_daily_target: campaign.writers_daily_target,
      },
      debug: {
        writersAssigned: writers.length,
        writers: writers.map(w => ({ id: w.id, name: w.name })),
        clientsWithWriters: clientsWithWriters.length,
        clientsDetail: clientsWithWriters,
        generationResult: taskResult,
        generationError: generationError,
        tasksCreated: createdTasks.total,
      }
    });
  } catch (error) {
    return Response.json(
      { error: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}
