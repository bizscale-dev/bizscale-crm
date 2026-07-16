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
      campaign_id INTEGER NOT NULL,
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
      campaign_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      business_name TEXT NOT NULL,
      assigned_associate_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
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
