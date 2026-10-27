// Which database the app talks to. The default is the self-hosted libSQL server
// on the VPS (VPS_DATABASE_URL / VPS_AUTH_TOKEN). DB_PROVIDER=turso is only an
// emergency fallback to the old Turso database (TURSO_DATABASE_URL /
// TURSO_AUTH_TOKEN) and needs that database to still exist and be current.
export function getDbConfig() {
  if ((process.env.DB_PROVIDER || '').toLowerCase() === 'turso') {
    return { provider: 'turso', url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN };
  }
  return { provider: 'vps', url: process.env.VPS_DATABASE_URL, authToken: process.env.VPS_AUTH_TOKEN };
}
