/**
 * POST /api/google-sheets/import-writers
 * Auto-creates writer users from Google Sheet Column I
 * This should be called before sync-apply-changes to ensure writers exist
 */
import { getDb, initDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(request) {
  try {
    await initDb();
    const db = await getDb();
    const { writerNames } = await request.json();

    if (!writerNames || !Array.isArray(writerNames) || writerNames.length === 0) {
      return Response.json(
        { error: 'writerNames array required' },
        { status: 400 }
      );
    }

    let created = 0;
    let existing = 0;
    const results = [];

    for (const name of writerNames) {
      const trimmedName = (name || '').trim();
      if (!trimmedName) continue;

      // Check if writer already exists
      const existingWriter = await db.prepare(
        "SELECT id FROM users WHERE role = 'writer' AND (name = ? OR email = ?)"
      ).get(trimmedName, `${trimmedName.toLowerCase().replace(/\s+/g, '.')}@writers.local`);

      if (existingWriter) {
        console.log(`[import-writers] Writer already exists: ${trimmedName}`);
        existing++;
        results.push({
          name: trimmedName,
          status: 'existing',
          id: existingWriter.id,
        });
        continue;
      }

      // Create new writer user
      try {
        const defaultPassword = bcrypt.hashSync(Math.random().toString(36).substring(7), 10);
        const email = `${trimmedName.toLowerCase().replace(/\s+/g, '.')}@writers.local`;

        const insertResult = await db.prepare(
          "INSERT INTO users (name, email, password, role, is_active) VALUES (?, ?, ?, ?, ?)"
        ).run(trimmedName, email, defaultPassword, 'writer', 1);

        console.log(`[import-writers] Created writer: ${trimmedName} (ID: ${insertResult.lastInsertRowid})`);
        created++;
        results.push({
          name: trimmedName,
          status: 'created',
          id: insertResult.lastInsertRowid,
          email,
        });
      } catch (err) {
        console.error(`[import-writers] Error creating writer ${trimmedName}:`, err.message);
        results.push({
          name: trimmedName,
          status: 'error',
          error: err.message,
        });
      }
    }

    console.log(`[import-writers] Import complete: ${created} created, ${existing} already existed`);

    return Response.json({
      success: true,
      message: `Writer import complete: ${created} created, ${existing} already existed`,
      created,
      existing,
      results,
    });
  } catch (error) {
    console.error('[import-writers] Error:', error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
