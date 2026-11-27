// Adds a new value to the allowed users.role list WITHOUT rebuilding the users table (dropping it
// would cascade-delete every child table). Only the role column is swapped, in one transaction.
//
//   node scripts/add-user-role.mjs support            -> shows what it would do
//   node scripts/add-user-role.mjs support --apply    -> backs up the users table to a file, applies,
//                                                        and checks that every table kept its row count
//
// Uses VPS_DATABASE_URL / VPS_AUTH_TOKEN from the environment or .env.local.
import { createClient } from '@libsql/client';
import fs from 'node:fs';

if (fs.existsSync('.env.local')) {
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const role = process.argv[2];
const apply = process.argv.includes('--apply');
if (!/^[a-z_]+$/.test(role || '')) throw new Error('Usage: node scripts/add-user-role.mjs <role_name> [--apply]');
const url = process.env.VPS_DATABASE_URL;
if (!url) throw new Error('VPS_DATABASE_URL is not set');
const db = createClient({ url, authToken: process.env.VPS_AUTH_TOKEN });

const usersSql = async () => (await db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'")).rows[0].sql;
const rowCounts = async () => {
  const { rows } = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'libsql_%' AND name NOT LIKE '_litestream%' ORDER BY name");
  const out = {};
  for (const { name } of rows) out[name] = Number((await db.execute(`SELECT COUNT(*) AS n FROM "${name}"`)).rows[0].n);
  return out;
};
const userRows = async () => (await db.execute('SELECT * FROM users ORDER BY id')).rows.map((r) => ({ ...r }));
const stable = (rows) => JSON.stringify(rows.map((r) => Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b)))));

async function main() {
  const before = await usersSql();
  const check = before.match(/role\s+TEXT[^,]*?CHECK\s*\(\s*role\s+IN\s*\(([^)]*)\)\s*\)/i);
  if (!check) throw new Error('Could not find the role CHECK list in the users table — nothing changed');
  const roles = [...check[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (roles.includes(role)) {
    console.log(`'${role}' is already allowed. Nothing to do.`);
    return;
  }
  const list = [...roles, role].map((r) => `'${r}'`).join(',');
  const statements = [
    'ALTER TABLE users RENAME COLUMN role TO role_old',
    `ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin' CHECK(role IN (${list}))`,
    'UPDATE users SET role = role_old',
    'ALTER TABLE users DROP COLUMN role_old',
  ];
  console.log(statements.join(';\n'));
  if (!apply) {
    console.log('\nDry run. Add --apply to run it.');
    return;
  }

  const countsBefore = await rowCounts();
  const usersBefore = await userRows();
  const backupFile = `users-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(backupFile, JSON.stringify({ sql: before, rows: usersBefore }, null, 1));
  console.log(`\nUsers table saved to ${backupFile} (contains password hashes — keep it private).`);

  await db.batch(statements, 'write'); // one transaction: all or nothing

  const countsAfter = await rowCounts();
  const changed = Object.keys(countsBefore).filter((t) => countsBefore[t] !== countsAfter[t]);
  const same = stable(usersBefore) === stable(await userRows());
  console.log((await usersSql()));
  console.log(`Tables checked: ${Object.keys(countsBefore).length}; row counts changed: ${changed.length ? changed.map((t) => `${t} ${countsBefore[t]} -> ${countsAfter[t]}`).join(', ') : 'none'}`);
  console.log(`Users identical to before: ${same ? 'yes' : 'NO — compare with the backup file'}`);
}

// Close the connection instead of calling process.exit(), which crashes Node on Windows here.
try {
  await main();
} finally {
  db.close();
}
