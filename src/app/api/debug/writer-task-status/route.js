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

    // Check clients with assigned writers
    const clientsWithWriters = await db.prepare(`
      SELECT c.id, c.name, u.name as writer_name, c.assigned_writer_id
      FROM clients c
      LEFT JOIN users u ON u.id = c.assigned_writer_id
      WHERE c.campaign_id = ? AND c.is_active = 1 AND c.assigned_writer_id IS NOT NULL
      ORDER BY u.name
    `).all(campaign.id);

    // Check existing writing tasks
    const writingTasks = await db.prepare(`
      SELECT COUNT(*) as total FROM writing_tasks WHERE campaign_id = ?
    `).get(campaign.id);

    // Try to generate tasks and catch the error
    let taskGenerationError = null;
    let taskGenerationResult = null;

    try {
      taskGenerationResult = await generateWriterTasks(campaign.id);
    } catch (err) {
      taskGenerationError = {
        message: err.message,
        stack: err.stack,
      };
    }

    // Check writer_assignments
    const writerAssignments = await db.prepare(`
      SELECT wa.id, u.name, wa.campaign_id, wa.user_id
      FROM writer_assignments wa
      JOIN users u ON u.id = wa.user_id
      WHERE wa.campaign_id = ?
    `).all(campaign.id);

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
        writers: {
          count: writers.length,
          list: writers,
        },
        writer_assignments: {
          count: writerAssignments.length,
          list: writerAssignments,
        },
        clientsWithWriters: {
          count: clientsWithWriters.length,
          list: clientsWithWriters.slice(0, 10),
        },
        writingTasks: {
          count: writingTasks.total,
        },
        taskGeneration: {
          error: taskGenerationError,
          result: taskGenerationResult,
        },
      },
    });
  } catch (error) {
    return Response.json(
      { error: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}
