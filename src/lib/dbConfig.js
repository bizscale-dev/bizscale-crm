// Which database the app talks to. DB_PROVIDER=vps uses the self-hosted
// libSQL server (VPS_DATABASE_URL / VPS_AUTH_TOKEN); anything else (or unset)
// uses Turso. Switching back is just changing DB_PROVIDER and redeploying.
export function getDbConfig() {
  if ((process.env.DB_PROVIDER || '').toLowerCase() === 'vps') {
    return { provider: 'vps', url: process.env.VPS_DATABASE_URL, authToken: process.env.VPS_AUTH_TOKEN };
  }
  return { provider: 'turso', url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN };
}
