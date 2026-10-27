// Copies one whole database onto the other (destination is rebuilt).
//   node scripts/sync-db.mjs turso-to-vps   # before switching DB_PROVIDER=vps
//   node scripts/sync-db.mjs vps-to-turso   # before switching back to Turso
// Stop writes (or accept losing anything written during the copy) first.
// Reads the connection details from .env.local.
import fs from 'fs';
import { backupDatabase } from '../src/lib/backupDb.js';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const turso = { url: env.TURSO_DATABASE_URL, token: env.TURSO_AUTH_TOKEN };
// https for the bulk copy; the destination must be empty (see runbook).
const vps = { url: env.VPS_DATABASE_URL.replace(/^libsql:/, 'https:'), token: env.VPS_AUTH_TOKEN };
const dir = process.argv[2];
if (dir !== 'turso-to-vps' && dir !== 'vps-to-turso') { console.error('usage: sync-db.mjs turso-to-vps|vps-to-turso'); process.exit(1); }
const [from, to] = dir === 'turso-to-vps' ? [turso, vps] : [vps, turso];
const r = await backupDatabase({ sourceUrl: from.url, sourceToken: from.token, backupUrl: to.url, backupToken: to.token });
console.log(`Copied ${r.rows} rows across ${r.tables} tables (${dir}); row counts verified.`);
