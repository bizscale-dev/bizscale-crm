import { createClient } from '@libsql/client';

// Full copy of the production database into the backup database. Only depends
// on @libsql/client so it can also be run from a plain node script.
//
// Each run rebuilds every table in the backup from production (drop, recreate
// with production's schema, copy rows), so the backup is an exact mirror as of
// the last run. Production is only ever read.

// One request per chunk, so bigger chunks = faster; capped by rows and by an
// approximate payload size because some rows carry base64 images.
const CHUNK_MAX_ROWS = 1000;
const CHUNK_MAX_BYTES = 1_500_000;

const q = (name) => `"${String(name).replace(/"/g, '""')}"`;

// Foreign keys are enforced on the backup connection, so a table has to be
// filled after the tables it references.
function parentsFirst(tables) {
  const names = new Set(tables.map((t) => t.name));
  const deps = new Map(tables.map((t) => [
    t.name,
    new Set([...String(t.sql).matchAll(/REFERENCES\s+["`\[]?([A-Za-z0-9_]+)/gi)].map((m) => m[1]).filter((n) => n !== t.name && names.has(n))),
  ]));
  const ordered = [];
  const done = new Set();
  const visit = (t, stack) => {
    if (done.has(t.name) || stack.has(t.name)) return;
    stack.add(t.name);
    for (const d of deps.get(t.name)) visit(tables.find((x) => x.name === d), stack);
    done.add(t.name);
    ordered.push(t);
  };
  for (const t of tables) visit(t, new Set());
  return { ordered, deps };
}

export async function backupDatabase({ sourceUrl, sourceToken, backupUrl, backupToken }) {
  if (!sourceUrl || !backupUrl || !backupToken) throw new Error('Backup database is not configured');
  if (sourceUrl === backupUrl) throw new Error('Backup URL is the same as the production URL — refusing to run');

  const src = createClient({ url: sourceUrl, authToken: sourceToken });
  const dst = createClient({ url: backupUrl, authToken: backupToken });

  try {
    const { rows: objects } = await src.execute(
      `SELECT type, name, sql FROM sqlite_master
       WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' AND name NOT LIKE 'libsql_%'`
    );
    const { ordered: tables, deps } = parentsFirst(objects.filter((o) => o.type === 'table'));
    const others = objects.filter((o) => o.type === 'index' || o.type === 'trigger' || o.type === 'view');

    // Clear the backup first: views/triggers/indexes, then tables.
    const { rows: existing } = await dst.execute(
      `SELECT type, name FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' AND name NOT LIKE 'libsql_%'`
    );
    const drops = [
      ...existing.filter((o) => o.type === 'view').map((o) => `DROP VIEW IF EXISTS ${q(o.name)}`),
      ...existing.filter((o) => o.type === 'trigger').map((o) => `DROP TRIGGER IF EXISTS ${q(o.name)}`),
      ...existing.filter((o) => o.type === 'table').map((o) => `DROP TABLE IF EXISTS ${q(o.name)}`),
    ];
    // Foreign keys off so drop/insert order doesn't matter on the backup.
    await dst.execute('PRAGMA foreign_keys = OFF');
    // (PRAGMA foreign_keys can't persist across HTTP requests or change inside a
    // transaction, so defer the checks to commit time within the drop batch.)
    if (drops.length) await dst.batch(['PRAGMA defer_foreign_keys = ON', ...drops], 'write');

    // Tables copy in parallel; each one waits only for the tables it references.
    const counts = {};
    const copies = new Map();
    const copyTable = async (t) => {
      await Promise.all([...deps.get(t.name)].map((d) => copies.get(d)));
      await dst.execute(t.sql);
      const { rows } = await src.execute(`SELECT * FROM ${q(t.name)}`);
      counts[t.name] = rows.length;
      if (rows.length === 0) return;
      const cols = Object.keys(rows[0]).filter((k) => Number.isNaN(Number(k)));
      const sql = `INSERT INTO ${q(t.name)} (${cols.map(q).join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
      let chunk = [];
      let bytes = 0;
      const flush = async () => {
        if (chunk.length) await dst.batch(chunk, 'write');
        chunk = [];
        bytes = 0;
      };
      for (const r of rows) {
        const args = cols.map((c) => r[c]);
        chunk.push({ sql, args });
        bytes += args.reduce((n, v) => n + (typeof v === 'string' ? v.length : 8), 0);
        if (chunk.length >= CHUNK_MAX_ROWS || bytes >= CHUNK_MAX_BYTES) await flush();
      }
      await flush();
    };
    for (const t of tables) copies.set(t.name, copyTable(t));
    await Promise.all(copies.values());

    for (const o of others) await dst.execute(o.sql);

    // Verify before reporting success.
    for (const t of tables) {
      const { rows } = await dst.execute(`SELECT COUNT(*) AS c FROM ${q(t.name)}`);
      if (Number(rows[0].c) !== counts[t.name]) {
        throw new Error(`Backup verification failed for ${t.name}: expected ${counts[t.name]}, got ${rows[0].c}`);
      }
    }
    return { tables: tables.length, rows: Object.values(counts).reduce((a, b) => a + b, 0), counts };
  } finally {
    src.close();
    dst.close();
  }
}
