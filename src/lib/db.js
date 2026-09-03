import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';

let rawClient;
let migrationsDone = false;

function normalizeRow(row) {
  return row ? { ...row } : row;
}

// libsql returns INSERT/UPDATE/DELETE metadata as `rowsAffected`/`lastInsertRowid` (a
// BigInt); the rest of the app expects the node:sqlite-style `{ changes, lastInsertRowid }`
// shape with a plain number, so normalize it here once instead of at every call site.
function normalizeRunResult(result) {
  return {
    changes: result.rowsAffected,
    lastInsertRowid: result.lastInsertRowid === undefined ? undefined : Number(result.lastInsertRowid),
  };
}

function wrapStmt(executor, sql) {
  return {
    run: async (...args) => normalizeRunResult(await executor({ sql, args })),
    get: async (...args) => {
      const result = await executor({ sql, args });
      return normalizeRow(result.rows[0]);
    },
    all: async (...args) => {
      const result = await executor({ sql, args });
      return result.rows.map(normalizeRow);
    },
  };
}

function makeDb(raw) {
  return {
    exec: (sql) => raw.executeMultiple(sql),
    prepare: (sql) => wrapStmt((stmt) => raw.execute(stmt), sql),
    // Batch: atomically run a list of independent { sql, args } statements (no read
    // depends on a prior write in the same batch) — use for bulk inserts. Chunked to
    // stay well under libsql's per-request statement/payload limits for large generators
    // (e.g. task generation can produce thousands of rows in one call).
    async batch(statements) {
      const CHUNK_SIZE = 500;
      for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
        await raw.batch(statements.slice(i, i + CHUNK_SIZE), 'write');
      }
    },
    // Transaction: for logic that reads then writes within one atomic unit. `fn`
    // receives a transaction-scoped db handle with the same prepare(sql).get/all/run
    // shape as the top-level db, bound to the transaction instead of the raw client.
    transaction(fn) {
      return async (...args) => {
        const tx = await raw.transaction('write');
        try {
          const txDb = { prepare: (sql) => wrapStmt((stmt) => tx.execute(stmt), sql) };
          const result = await fn(txDb, ...args);
          await tx.commit();
          return result;
        } catch (e) {
          try { await tx.rollback(); } catch (_) {}
          throw e;
        }
      };
    },
    close: () => raw.close(),
  };
}

async function runMigrations(raw) {
  // Idempotent schema evolution: each ALTER TABLE/CREATE TABLE runs against whatever
  // schema state Turso currently has. try/catch per-statement because SQLite has no
  // "ADD COLUMN IF NOT EXISTS" — a failure here just means the column/table already exists.
  const alterStatements = [
    "ALTER TABLE clients ADD COLUMN is_active INTEGER DEFAULT 1",
    "ALTER TABLE clients ADD COLUMN assigned_associate_id INTEGER",
    "ALTER TABLE campaigns ADD COLUMN posts_per_client INTEGER DEFAULT 21",
    "ALTER TABLE campaigns ADD COLUMN writer_clients_per_day INTEGER DEFAULT 8",
    "ALTER TABLE clients ADD COLUMN assigned_writer_id INTEGER",
    "ALTER TABLE writing_tasks ADD COLUMN client_id INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE writing_tasks ADD COLUMN week_number INTEGER",
    "ALTER TABLE writing_tasks ADD COLUMN post_type TEXT",
    "ALTER TABLE clients ADD COLUMN tunnel_status TEXT DEFAULT 'none'",
    "ALTER TABLE clients ADD COLUMN tunnel_start_date DATE",
    "ALTER TABLE campaigns ADD COLUMN webseo_guestpost_target INTEGER DEFAULT 7",
    "ALTER TABLE campaigns ADD COLUMN webseo_web2_target INTEGER DEFAULT 7",
    "ALTER TABLE campaigns ADD COLUMN web_seo_guestpost_target INTEGER DEFAULT 10",
    "ALTER TABLE campaigns ADD COLUMN web_seo_web2_target INTEGER DEFAULT 10",
    "ALTER TABLE clients ADD COLUMN funnel_month INTEGER",
    "ALTER TABLE clients ADD COLUMN funnel_month_end_date DATE",
    "ALTER TABLE clients ADD COLUMN funnel_cycle_index_at_enroll INTEGER",
    "ALTER TABLE tunnel_tasks ADD COLUMN funnel_month INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE campaigns ADD COLUMN funnel_bonus_web2 INTEGER DEFAULT 0",
    "ALTER TABLE campaigns ADD COLUMN funnel_bonus_guestpost INTEGER DEFAULT 0",
    "ALTER TABLE campaigns ADD COLUMN funnel_bonus_pdf INTEGER DEFAULT 0",
    "ALTER TABLE campaigns ADD COLUMN funnel_bonus_profile INTEGER DEFAULT 0",
    "ALTER TABLE campaigns ADD COLUMN funnel_bonus_citation INTEGER DEFAULT 0",
    "ALTER TABLE campaigns ADD COLUMN funnel_bonus_image INTEGER DEFAULT 0",
    // Live, all-time total pulled straight from the completed-links sheet across every
    // client assigned to this associate (not scoped to a campaign's daily rotation) —
    // refreshed on each sync run so associates with pre-existing sheet history can see
    // their real total immediately, instead of waiting for the rotation to reach them.
    "ALTER TABLE users ADD COLUMN lifetime_completed_links INTEGER DEFAULT 0",
    // Web clients had no soft-delete flag at all until now — a client removed from
    // the import sheet gets deactivated (history/webseo_tasks preserved) rather than
    // deleted, matching the regular clients table's existing is_active pattern.
    "ALTER TABLE web_clients ADD COLUMN is_active INTEGER DEFAULT 1",
    // Which Web SEO Associate a writer mirrors — set only for writers doing "Web Tasks"
    // (writing the actual posts for a Web SEO Associate's client roster). Null for
    // writers not doing this.
    "ALTER TABLE users ADD COLUMN mirrors_web_associate_id INTEGER",
    // Rotation pace for the GBP-Off Page / Web-Off Page writer task sheets (see
    // writerOffpageSync.js) — how many clients per writer get featured per working day.
    "ALTER TABLE campaigns ADD COLUMN gbp_writer_clients_per_day INTEGER DEFAULT 8",
    "ALTER TABLE campaigns ADD COLUMN weboff_writer_clients_per_day INTEGER DEFAULT 6",
    // Writer scheduling is now driven by its own independent writer_campaigns entity
    // (see writerOffpageSync.js) instead of the main campaigns row, so an admin can
    // start a writer's rotation before the associate-facing campaign exists. The old
    // campaign_id column on these two tables is left in place but unused going forward.
    "ALTER TABLE writer_offpage_assignments ADD COLUMN writer_campaign_id INTEGER",
    "ALTER TABLE writer_offpage_tasks ADD COLUMN writer_campaign_id INTEGER",
    // Distinguishes a genuinely-verified daily delta from a client/task's very
    // first-ever tracked day (no earlier day to diff against) — see daily_activity_log.
    "ALTER TABLE daily_activity_log ADD COLUMN is_verified INTEGER NOT NULL DEFAULT 1",
    // The web client's site URL, captured from the Web Clients sheet import (columns
    // C and K, paired with the name columns D and L — see webClientsImport.js). Used
    // to fetch that site's sitemap for the EOD Report page-picker.
    "ALTER TABLE web_clients ADD COLUMN website TEXT",
    // Which specific page on the site an EOD report entry's work applies to —
    // selected from the site's sitemap, or typed manually if no sitemap is found.
    "ALTER TABLE eod_report_entries ADD COLUMN page_url TEXT",
    // Frozen at capture time (see dailyActivityCapture.js) — whether the client was
    // active in the Funnel on the day this row was captured, so the "By Person"
    // report can break out funnel work without re-deriving it from current (possibly
    // since-changed) client state.
    "ALTER TABLE daily_activity_log ADD COLUMN is_funnel INTEGER NOT NULL DEFAULT 0",
    // Set when an admin manually deactivates a client from /admin/clients (as opposed to
  // the nightly Google Sheets sync auto-deactivating one that was removed from the
  // sheet). The sync's "still in the sheet but is_active=0 → reactivate" step must skip
  // these — otherwise a manual deactivation gets silently undone the next time the
  // client's row is still present in the sheet (the sheet was never edited to remove it).
  // Cleared by a manual reactivation, from either the admin panel or the sync itself
  // reactivating a client that was sheet-deactivated (not this flag).
  "ALTER TABLE clients ADD COLUMN manually_deactivated INTEGER DEFAULT 0",
  // Manual week-by-week control within Funnel Month 1 (tunnel_status='active',
    // funnel_month=1) — see src/lib/funnel.js. start_week is fixed at enrollment
    // (weeks before it never get seo_tasks rows); current_week advances one at a
    // time via the admin's manual action and gates how far generateSEOTasks goes —
    // weeks between start and current (inclusive) all get generated, so advancing
    // preserves prior weeks' history instead of replacing it.
    "ALTER TABLE clients ADD COLUMN funnel_month1_start_week INTEGER",
    "ALTER TABLE clients ADD COLUMN funnel_month1_current_week INTEGER",
    // Web SEO now runs on its own independent webseo_campaigns entity (own
    // start_date/total_days/status — see webseo_campaigns below) instead of the
    // shared campaigns table, so it can run on completely different dates than the
    // SEO-associate campaign. The old campaign_id column is left in place but
    // unused going forward, matching the writer_offpage_* precedent.
    "ALTER TABLE web_clients ADD COLUMN webseo_campaign_id INTEGER",
    "ALTER TABLE webseo_tasks ADD COLUMN webseo_campaign_id INTEGER",
    // Writer campaigns can now be named too (matching campaigns.name and
    // webseo_campaigns.name), so a past one is identifiable on its history list
    // instead of just a bare id/date.
    "ALTER TABLE writer_campaigns ADD COLUMN name TEXT",
  ];

  for (const sql of alterStatements) {
    try {
      await raw.execute(sql);
    } catch (e) {
      // Column already exists, that's fine
    }
  }

  const createTableStatements = [
    `CREATE TABLE IF NOT EXISTS webseo_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER,
      webseo_campaign_id INTEGER,
      client_id INTEGER NOT NULL,
      associate_id INTEGER NOT NULL,
      day_number INTEGER NOT NULL,
      task_date DATE NOT NULL,
      post_type TEXT NOT NULL,
      target_count INTEGER DEFAULT 1,
      completed_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS web_seo_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      associate_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      week_number INTEGER,
      day_number INTEGER,
      task_date DATE,
      post_type TEXT NOT NULL,
      target_count INTEGER DEFAULT 1,
      completed_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS tunnel_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      week_number INTEGER NOT NULL,
      category TEXT NOT NULL,
      platform TEXT NOT NULL,
      url TEXT,
      note TEXT,
      requires TEXT,
      order_in_week INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(campaign_id, week_number, category, platform)
    )`,
    `CREATE TABLE IF NOT EXISTS tunnel_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      week_number INTEGER NOT NULL,
      category TEXT NOT NULL,
      platform TEXT NOT NULL,
      url TEXT,
      note TEXT,
      requires TEXT,
      status TEXT DEFAULT 'pending',
      completed_at DATETIME,
      assigned_to INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS web_clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER,
      webseo_campaign_id INTEGER,
      name TEXT NOT NULL,
      business_name TEXT NOT NULL,
      assigned_associate_id INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assigned_associate_id) REFERENCES users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS campaign_off_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      off_date DATE NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(campaign_id, off_date),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    )`,
    // One row per sync trigger run (manual or Vercel Cron) — lets the admin UI show
    // "did last night's trigger actually run, and what happened" instead of that only
    // being visible in Vercel's function logs.
    `CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_type TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    // A writer's mirrored copy of a Web SEO Associate's task schedule — same client
    // (web_clients), day, and post type as the associate's webseo_tasks row, generated
    // alongside it in generateWebSeoTasks. completed_count here is the writer's own
    // independent progress (they log their own posts via web_writing_logs), separate
    // from the associate's completed_count.
    `CREATE TABLE IF NOT EXISTS web_writing_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      writer_id INTEGER NOT NULL,
      associate_id INTEGER NOT NULL,
      day_number INTEGER NOT NULL,
      task_date DATE NOT NULL,
      post_type TEXT NOT NULL,
      target_count INTEGER DEFAULT 1,
      completed_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS web_writing_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      word_count INTEGER,
      notes TEXT,
      logged_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES web_writing_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (logged_by) REFERENCES users(id)
    )`,
    // Persistent, incrementally-maintained writer<->client assignment for the
    // GBP-Off Page / Web-Off Page writer sheets (see writerOffpageSync.js) — separate
    // per task_type since the two tabs have different, only partially overlapping
    // client rosters. Only touched by adding new clients / removing gone ones on each
    // sync, never wiped wholesale, so a client stays with the same writer over time.
    `CREATE TABLE IF NOT EXISTS writer_offpage_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER,
      writer_campaign_id INTEGER,
      task_type TEXT NOT NULL CHECK(task_type IN ('gbp','weboff')),
      client_id INTEGER NOT NULL,
      writer_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(writer_campaign_id, task_type, client_id)
    )`,
    // One row per (writer, client, category) block, wiped and rebuilt every sync —
    // completed_count is always re-derived live from the sheet's current Status
    // column values (the sheet is the sole source of truth for completion), so
    // there's no prior-progress-loss risk from wiping, unlike seo_tasks/webseo_tasks.
    `CREATE TABLE IF NOT EXISTS writer_offpage_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER,
      writer_campaign_id INTEGER,
      writer_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      task_type TEXT NOT NULL CHECK(task_type IN ('gbp','weboff')),
      category TEXT NOT NULL,
      day_number INTEGER NOT NULL,
      task_date DATE NOT NULL,
      target_count INTEGER DEFAULT 0,
      completed_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    // Independent writer scheduling entity — its own start_date/total_days, fully
    // decoupled from the main (SEO) campaigns table, so an admin can kick off a
    // writer's rotation (e.g. Week 1) whenever, even with no SEO campaign at all.
    // source_campaign_id is vestigial (kept only for historical rows created
    // before writers got their own writer_clients roster) — no longer written or
    // required on new writer campaigns.
    `CREATE TABLE IF NOT EXISTS writer_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_campaign_id INTEGER,
      name TEXT,
      start_date DATE NOT NULL,
      total_days INTEGER NOT NULL DEFAULT 16,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS writer_campaign_off_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      writer_campaign_id INTEGER NOT NULL,
      off_date DATE NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(writer_campaign_id, off_date),
      FOREIGN KEY (writer_campaign_id) REFERENCES writer_campaigns(id) ON DELETE CASCADE
    )`,
    // Writers' own independent client roster — no longer name-matched against the
    // SEO campaign's `clients` table. Populated automatically as new client names
    // are seen in the GBP-Off Page / Web-Off Page sheet tabs (see
    // writerOffpageSync.js) — there's no separate "import" step, the sheet is
    // already the sole source of these names.
    `CREATE TABLE IF NOT EXISTS writer_clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      writer_campaign_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(writer_campaign_id, name),
      FOREIGN KEY (writer_campaign_id) REFERENCES writer_campaigns(id) ON DELETE CASCADE
    )`,
    // Independent Web SEO scheduling entity — its own start_date/total_days/status,
    // fully decoupled from the main (SEO) campaigns table, so Web SEO can run on
    // completely different dates/duration and doesn't care whether the SEO
    // campaign is active, paused, or completed. Unlike writer_campaigns, no
    // source-campaign link is needed at all — web_clients are imported straight
    // from their own Google Sheet tab, never name-matched against SEO's clients.
    `CREATE TABLE IF NOT EXISTS webseo_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_date DATE NOT NULL,
      total_days INTEGER NOT NULL DEFAULT 16,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed')),
      webseo_web2_target INTEGER DEFAULT 7,
      webseo_guestpost_target INTEGER DEFAULT 7,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS webseo_campaign_off_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      webseo_campaign_id INTEGER NOT NULL,
      off_date DATE NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(webseo_campaign_id, off_date),
      FOREIGN KEY (webseo_campaign_id) REFERENCES webseo_campaigns(id) ON DELETE CASCADE
    )`,
    // Permanent, immutable daily record of completed work — captured once per day
    // (see src/lib/dailyActivityCapture.js, run by a 12:25 AM cron) from whatever the
    // live task tables (seo_tasks/webseo_tasks/writer_offpage_tasks) show for the
    // day that just closed out. Once a day is captured here it is never
    // recalculated again, unlike the live tables which keep getting resynced —
    // this is what the "By Person" report reads from, so historical numbers stay
    // stable instead of drifting as later, unrelated syncs run.
    // client_name is a point-in-time snapshot (not an FK) since clients can be
    // renamed/deactivated later and a historical log shouldn't shift when that
    // happens. task_type is '' (not NULL) for SEO/Web SEO associates so the
    // UNIQUE constraint dedupes correctly — SQLite treats NULL as never equal to
    // NULL, which would defeat ON CONFLICT for those rows.
    // is_verified = 0 means this row is a client/task's very first-ever tracked
    // day, with no earlier day to diff the sheet's cumulative total against — the
    // completed_count is real (whatever the sheet showed at capture time), but may
    // include work finished before tracking started, so it's kept separate from
    // the trustworthy "Completed" total rather than hidden outright.
    `CREATE TABLE IF NOT EXISTS daily_activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      client_name TEXT NOT NULL,
      task_type TEXT NOT NULL DEFAULT '',
      label TEXT NOT NULL,
      work_date DATE NOT NULL,
      target_count INTEGER NOT NULL DEFAULT 0,
      completed_count INTEGER NOT NULL DEFAULT 0,
      is_verified INTEGER NOT NULL DEFAULT 1,
      captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, client_name, task_type, label, work_date)
    )`,
    // End-of-day reports filed by Web SEO Managers (see /web-seo-manager/eod). One
    // report per manager per day — the UNIQUE below is what makes a second submission
    // on the same date append its entries to that day's existing report rather than
    // create a duplicate.
    `CREATE TABLE IF NOT EXISTS eod_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      report_date DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, report_date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    // web_client_name is denormalized on purpose (same precedent as
    // daily_activity_log.client_name above): an EOD report is a permanent historical
    // record and must still read correctly after a web client is renamed, deactivated,
    // or left behind in a past campaign.
    `CREATE TABLE IF NOT EXISTS eod_report_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      web_client_id INTEGER NOT NULL,
      web_client_name TEXT NOT NULL,
      work_done TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES eod_reports(id) ON DELETE CASCADE
    )`,
    // Per-user daily backlog tracking for the "By Person" report's Pending Backlog
    // box (see src/app/admin/reports/actions.js). resolved_count is accumulated
    // across the day's sync runs (see sync-completed-links/sync-webseo-completed-links)
    // — how much old overdue work got paid down that specific day. remaining_count
    // is overwritten once nightly by the capture cron (dailyActivityCapture.js) — a
    // frozen point-in-time snapshot of how much backlog was still outstanding as of
    // that day's capture, so past report dates show an honest historical number
    // instead of "right now".
    `CREATE TABLE IF NOT EXISTS daily_pending_snapshot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      work_date DATE NOT NULL,
      resolved_count INTEGER NOT NULL DEFAULT 0,
      remaining_count INTEGER NOT NULL DEFAULT 0,
      captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, work_date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  ];

  for (const sql of createTableStatements) {
    try {
      await raw.execute(sql);
    } catch (e) {
      // Table already exists
    }
  }

  // Rebuild tunnel_templates if it was created under the old, narrower UNIQUE constraint
  // (campaign_id, week_number, platform) — that constraint blocks the same platform (e.g.
  // pinterest.com) appearing under two different Funnel categories, which is valid.
  try {
    const existingResult = await raw.execute(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='tunnel_templates'"
    );
    const existing = existingResult.rows[0];

    if (existing && !existing.sql.includes('UNIQUE(campaign_id, week_number, category, platform)')) {
      await raw.execute('ALTER TABLE tunnel_templates RENAME TO tunnel_templates_old');
      await raw.execute(`
        CREATE TABLE tunnel_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          campaign_id INTEGER NOT NULL,
          week_number INTEGER NOT NULL,
          category TEXT NOT NULL,
          platform TEXT NOT NULL,
          url TEXT,
          note TEXT,
          requires TEXT,
          order_in_week INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(campaign_id, week_number, category, platform)
        )
      `);
      await raw.execute(`
        INSERT INTO tunnel_templates (id, campaign_id, week_number, category, platform, url, note, requires, order_in_week, created_at)
        SELECT id, campaign_id, week_number, category, platform, url, note, requires, order_in_week, created_at FROM tunnel_templates_old
      `);
      await raw.execute('DROP TABLE tunnel_templates_old');
    }
  } catch (e) {
    // Migration already done or table doesn't exist yet
  }

  // Rebuild writer_offpage_assignments if it still has the old UNIQUE(campaign_id,
  // task_type, client_id) constraint from before writer scheduling moved to its own
  // independent writer_campaigns entity — that constraint collides with pre-existing
  // rows from the old campaign-scoped system once a new writer campaign starts
  // reusing the same source_campaign_id. campaign_id/writer_campaign_id are also
  // widened to nullable here, matching the new CREATE TABLE definition above.
  try {
    const existingResult = await raw.execute(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='writer_offpage_assignments'"
    );
    const existing = existingResult.rows[0];

    if (existing && !existing.sql.includes('UNIQUE(writer_campaign_id, task_type, client_id)')) {
      await raw.execute('ALTER TABLE writer_offpage_assignments RENAME TO writer_offpage_assignments_old');
      await raw.execute(`
        CREATE TABLE writer_offpage_assignments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          campaign_id INTEGER,
          writer_campaign_id INTEGER,
          task_type TEXT NOT NULL CHECK(task_type IN ('gbp','weboff')),
          client_id INTEGER NOT NULL,
          writer_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(writer_campaign_id, task_type, client_id)
        )
      `);
      await raw.execute(`
        INSERT INTO writer_offpage_assignments (id, campaign_id, writer_campaign_id, task_type, client_id, writer_id, created_at)
        SELECT id, campaign_id, writer_campaign_id, task_type, client_id, writer_id, created_at FROM writer_offpage_assignments_old
      `);
      await raw.execute('DROP TABLE writer_offpage_assignments_old');
    }
  } catch (e) {
    // Migration already done or table doesn't exist yet
  }

  // Widen writer_campaigns.source_campaign_id to nullable — creating a writer
  // campaign no longer requires an SEO campaign to exist (writers get their own
  // independent client roster, see writer_clients above), so this column is now
  // vestigial rather than load-bearing. Guarded the same way as the
  // writer_offpage_assignments rebuild above.
  try {
    const existingResult = await raw.execute(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='writer_campaigns'"
    );
    const existing = existingResult.rows[0];

    if (existing && existing.sql.includes('source_campaign_id INTEGER NOT NULL')) {
      await raw.execute('ALTER TABLE writer_campaigns RENAME TO writer_campaigns_old');
      await raw.execute(`
        CREATE TABLE writer_campaigns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_campaign_id INTEGER,
          name TEXT,
          start_date DATE NOT NULL,
          total_days INTEGER NOT NULL DEFAULT 16,
          status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await raw.execute(`
        INSERT INTO writer_campaigns (id, source_campaign_id, start_date, total_days, status, created_at)
        SELECT id, source_campaign_id, start_date, total_days, status, created_at FROM writer_campaigns_old
      `);
      await raw.execute('DROP TABLE writer_campaigns_old');
    }
  } catch (e) {
    // Migration already done or table doesn't exist yet
  }

  // Widen web_clients.campaign_id and webseo_tasks.campaign_id to nullable, and
  // drop web_clients' cascading FK to campaigns — Web SEO no longer depends on the
  // SEO campaigns table at all (see webseo_campaign_id / webseo_campaigns above),
  // so a future SEO campaign deletion must not silently cascade-delete Web SEO's
  // historical data through the old column. Guarded the same way as the other
  // rebuilds above.
  try {
    const existingResult = await raw.execute(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='web_clients'"
    );
    const existing = existingResult.rows[0];

    if (existing && existing.sql.includes('campaign_id INTEGER NOT NULL')) {
      await raw.execute('ALTER TABLE web_clients RENAME TO web_clients_old');
      await raw.execute(`
        CREATE TABLE web_clients (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          campaign_id INTEGER,
          webseo_campaign_id INTEGER,
          name TEXT NOT NULL,
          business_name TEXT NOT NULL,
          assigned_associate_id INTEGER,
          is_active INTEGER DEFAULT 1,
          website TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (assigned_associate_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `);
      await raw.execute(`
        INSERT INTO web_clients (id, campaign_id, webseo_campaign_id, name, business_name, assigned_associate_id, is_active, website, created_at)
        SELECT id, campaign_id, webseo_campaign_id, name, business_name, assigned_associate_id, is_active, website, created_at FROM web_clients_old
      `);
      await raw.execute('DROP TABLE web_clients_old');
    }
  } catch (e) {
    console.warn('web_clients nullable-campaign_id migration skipped:', e.message);
  }

  try {
    const existingResult = await raw.execute(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='webseo_tasks'"
    );
    const existing = existingResult.rows[0];

    if (existing && existing.sql.includes('campaign_id INTEGER NOT NULL')) {
      await raw.execute('ALTER TABLE webseo_tasks RENAME TO webseo_tasks_old');
      await raw.execute(`
        CREATE TABLE webseo_tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          campaign_id INTEGER,
          webseo_campaign_id INTEGER,
          client_id INTEGER NOT NULL,
          associate_id INTEGER NOT NULL,
          day_number INTEGER NOT NULL,
          task_date DATE NOT NULL,
          post_type TEXT NOT NULL,
          target_count INTEGER DEFAULT 1,
          completed_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await raw.execute(`
        INSERT INTO webseo_tasks (id, campaign_id, webseo_campaign_id, client_id, associate_id, day_number, task_date, post_type, target_count, completed_count, created_at)
        SELECT id, campaign_id, webseo_campaign_id, client_id, associate_id, day_number, task_date, post_type, target_count, completed_count, created_at FROM webseo_tasks_old
      `);
      await raw.execute('DROP TABLE webseo_tasks_old');
    }
  } catch (e) {
    console.warn('webseo_tasks nullable-campaign_id migration skipped:', e.message);
  }

  // One-time backfill: give Web SEO its own webseo_campaigns row(s) instead of
  // sharing the main campaigns table. For each distinct campaign_id already
  // referenced by web_clients/webseo_tasks, create a matching webseo_campaigns row
  // (copying that campaign's name/dates/webseo targets) and repoint every
  // web_clients/webseo_tasks row at it — the most recently-created one is marked
  // active so Web SEO keeps working immediately regardless of the SEO campaign's
  // own status. Guarded to run only once (skipped once webseo_campaigns has rows).
  try {
    const already = await raw.execute('SELECT id FROM webseo_campaigns LIMIT 1');
    if (already.rows.length === 0) {
      const sourceIdsResult = await raw.execute(`
        SELECT DISTINCT campaign_id FROM (
          SELECT campaign_id FROM web_clients WHERE campaign_id IS NOT NULL
          UNION
          SELECT campaign_id FROM webseo_tasks WHERE campaign_id IS NOT NULL
        )
      `);
      const sourceIds = sourceIdsResult.rows.map(r => r.campaign_id);

      if (sourceIds.length > 0) {
        const campaignsResult = await raw.execute(
          `SELECT id, name, start_date, total_days, webseo_web2_target, webseo_guestpost_target FROM campaigns WHERE id IN (${sourceIds.map(() => '?').join(',')})`,
          sourceIds
        );
        const byId = new Map(campaignsResult.rows.map(c => [c.id, c]));
        // Most recently created source campaign's webseo_campaigns row starts active.
        const mostRecentId = Math.max(...sourceIds);

        for (const oldId of sourceIds) {
          const c = byId.get(oldId);
          if (!c) continue;
          const status = oldId === mostRecentId ? 'active' : 'completed';
          const inserted = await raw.execute(
            `INSERT INTO webseo_campaigns (name, start_date, total_days, status, webseo_web2_target, webseo_guestpost_target)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [c.name, c.start_date, c.total_days, status, c.webseo_web2_target, c.webseo_guestpost_target]
          );
          const newId = Number(inserted.lastInsertRowid);
          await raw.execute('UPDATE web_clients SET webseo_campaign_id = ? WHERE campaign_id = ?', [newId, oldId]);
          await raw.execute('UPDATE webseo_tasks SET webseo_campaign_id = ? WHERE campaign_id = ?', [newId, oldId]);
        }
      }
    }
  } catch (e) {
    console.warn('webseo_campaigns backfill skipped:', e.message);
  }

  // One-time backfill: give Writers their own writer_clients roster instead of
  // pointing writer_offpage_assignments/tasks at the SEO clients table. For every
  // distinct (writer_campaign_id, client_id) pair already referenced, create a
  // matching writer_clients row (copying the name from the clients row it used to
  // point at) and repoint client_id at the new row. Guarded to run only once
  // (skipped once writer_clients has rows, or once no writer_offpage rows still
  // point at the old clients table).
  try {
    const already = await raw.execute('SELECT id FROM writer_clients LIMIT 1');
    if (already.rows.length === 0) {
      const pairsResult = await raw.execute(`
        SELECT DISTINCT writer_campaign_id, client_id FROM (
          SELECT writer_campaign_id, client_id FROM writer_offpage_assignments WHERE writer_campaign_id IS NOT NULL
          UNION
          SELECT writer_campaign_id, client_id FROM writer_offpage_tasks WHERE writer_campaign_id IS NOT NULL
        )
      `);

      for (const { writer_campaign_id, client_id } of pairsResult.rows) {
        const clientResult = await raw.execute('SELECT name FROM clients WHERE id = ?', [client_id]);
        const clientName = clientResult.rows[0]?.name;
        if (!clientName) continue;

        let newId;
        const existingWc = await raw.execute(
          'SELECT id FROM writer_clients WHERE writer_campaign_id = ? AND name = ?',
          [writer_campaign_id, clientName]
        );
        if (existingWc.rows.length > 0) {
          newId = existingWc.rows[0].id;
        } else {
          const inserted = await raw.execute(
            'INSERT INTO writer_clients (writer_campaign_id, name) VALUES (?, ?)',
            [writer_campaign_id, clientName]
          );
          newId = Number(inserted.lastInsertRowid);
        }

        await raw.execute(
          'UPDATE writer_offpage_assignments SET client_id = ? WHERE writer_campaign_id = ? AND client_id = ?',
          [newId, writer_campaign_id, client_id]
        );
        await raw.execute(
          'UPDATE writer_offpage_tasks SET client_id = ? WHERE writer_campaign_id = ? AND client_id = ?',
          [newId, writer_campaign_id, client_id]
        );
      }
    }
  } catch (e) {
    console.warn('writer_clients backfill skipped:', e.message);
  }

  // Widen the users.role CHECK constraint as new roles are added. Guarded by
  // inspecting the current schema so the rename+recreate only runs when a role is
  // actually missing.
  //
  // Other tables (web_clients, seo_tasks, etc.) have FOREIGN KEY ... REFERENCES
  // users(id). Renaming `users` itself would make SQLite auto-rewrite those other
  // tables' FK references to follow the rename (e.g. to "users_old"), which then
  // breaks them once the old table is dropped — and Turso's remote protocol doesn't
  // allow the `PRAGMA legacy_alter_table` that normally suppresses this. Avoided
  // entirely by building the replacement under a throwaway name that nothing
  // references yet, dropping the original, then renaming the replacement into
  // place — at that point nothing points at the throwaway name, so there's nothing
  // for SQLite to rewrite, and every other table's existing "REFERENCES users(id)"
  // text (never touched) resolves correctly once `users` exists again.
  try {
    const REQUIRED_ROLES = ['admin', 'seo_associate', 'writer', 'manager', 'web_seo_associate', 'writers_manager', 'seo_manager', 'web_seo_manager'];
    const currentSchema = await raw.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'");
    const currentSql = currentSchema.rows[0]?.sql || '';
    const missingRole = REQUIRED_ROLES.some(role => !currentSql.includes(`'${role}'`));

    if (missingRole) {
      await raw.execute('PRAGMA foreign_keys = OFF');
      await raw.execute('DROP TABLE IF EXISTS users_new');
      await raw.execute(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN (${REQUIRED_ROLES.map(r => `'${r}'`).join(',')})),
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          lifetime_completed_links INTEGER DEFAULT 0
        )
      `);
      await raw.execute('INSERT INTO users_new SELECT * FROM users');
      await raw.execute('DROP TABLE users');
      await raw.execute('ALTER TABLE users_new RENAME TO users');
      await raw.execute('PRAGMA foreign_keys = ON');
    }
  } catch (e) {
    console.warn('users role-constraint migration skipped:', e.message);
  }
}

export async function getDb() {
  if (!rawClient) {
    rawClient = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    await rawClient.execute('PRAGMA foreign_keys = ON');
  }

  if (!migrationsDone) {
    migrationsDone = true;
    await runMigrations(rawClient);
  }

  return makeDb(rawClient);
}

export async function initDb() {
  const db = await getDb();

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','seo_associate','writer','manager','web_seo_associate','writers_manager','seo_manager','web_seo_manager')),
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      lifetime_completed_links INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      total_days INTEGER DEFAULT 16,
      start_date DATE,
      total_clients INTEGER DEFAULT 100,
      clients_per_day INTEGER DEFAULT 4,
      links_per_client INTEGER DEFAULT 50,
      web2_target INTEGER DEFAULT 7,
      guestpost_target INTEGER DEFAULT 7,
      pdf_target INTEGER DEFAULT 7,
      profile_target INTEGER DEFAULT 10,
      citation_target INTEGER DEFAULT 10,
      image_target INTEGER DEFAULT 9,
      writer_approach INTEGER DEFAULT 1,
      writers_daily_target INTEGER DEFAULT 70,
      posts_per_client INTEGER DEFAULT 21,
      writer_clients_per_day INTEGER DEFAULT 8,
      status TEXT DEFAULT 'active',
      google_clients_sheet_id TEXT,
      google_clients_tab TEXT,
      google_associates_sheet_id TEXT,
      google_associates_tab TEXT,
      webseo_web2_target INTEGER DEFAULT 7,
      webseo_guestpost_target INTEGER DEFAULT 7,
      funnel_bonus_web2 INTEGER DEFAULT 0,
      funnel_bonus_guestpost INTEGER DEFAULT 0,
      funnel_bonus_pdf INTEGER DEFAULT 0,
      funnel_bonus_profile INTEGER DEFAULT 0,
      funnel_bonus_citation INTEGER DEFAULT 0,
      funnel_bonus_image INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      website TEXT,
      niche TEXT,
      notes TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      assigned_associate_id INTEGER,
      assigned_writer_id INTEGER,
      tunnel_status TEXT DEFAULT 'none',
      tunnel_start_date DATE,
      funnel_month INTEGER,
      funnel_month_end_date DATE,
      funnel_cycle_index_at_enroll INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_associate_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS associate_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      client_group_start INTEGER NOT NULL,
      client_group_end INTEGER NOT NULL,
      daily_link_target INTEGER DEFAULT 63,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(campaign_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS writer_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      daily_post_target INTEGER DEFAULT 70,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(campaign_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS seo_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      associate_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      day_number INTEGER NOT NULL,
      task_date DATE,
      link_type TEXT NOT NULL CHECK(link_type IN ('web2','guestpost','pdf','profile','citation','image')),
      target_count INTEGER DEFAULT 0,
      completed_count INTEGER DEFAULT 0,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (associate_id) REFERENCES users(id),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS link_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      anchor_text TEXT,
      notes TEXT,
      logged_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES seo_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (logged_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS writing_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      writer_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL DEFAULT 0,
      week_number INTEGER,
      day_number INTEGER NOT NULL,
      task_date DATE,
      post_type TEXT,
      target_count INTEGER DEFAULT 0,
      completed_count INTEGER DEFAULT 0,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (writer_id) REFERENCES users(id),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS writing_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      word_count INTEGER,
      notes TEXT,
      logged_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES writing_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (logged_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS google_oauth_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // Seed default admin
  try {
    const existing = await db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
    if (!existing) {
      const adminEmail = (process.env.ADMIN_EMAIL || '').trim() || 'admin@bizscale.com';
      const adminPass  = (process.env.ADMIN_PASSWORD || '').trim() || 'admin123';
      const hash = bcrypt.hashSync(adminPass, 10);
      await db.prepare("INSERT OR IGNORE INTO users (name, email, password, role) VALUES ('Admin', ?, ?, 'admin')")
        .run(adminEmail, hash);
      console.log(`Default admin created: ${adminEmail} / ${adminPass}`);
    }
  } catch (e) {
    console.warn('Admin seed skipped:', e.message);
  }

  // Seed default campaign
  try {
    const campaign = await db.prepare('SELECT id FROM campaigns LIMIT 1').get();
    if (!campaign) {
      await db.prepare("INSERT INTO campaigns (name, total_days, start_date, status) VALUES ('Campaign 1', 16, date('now'), 'active')")
        .run();
    }
  } catch (e) {
    console.warn('Campaign seed skipped:', e.message);
  }

  return db;
}
