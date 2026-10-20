// Which manager owns which client — used by QA's Executives page so an issue
// raised on many clients only goes to the manager who actually has each one.
//
//  - SEO clients: the sheet's Support column (clients.support_number, 1-10).
//    1-5 -> M Hussain, 6-10 -> Talha.
//  - Web clients: the sheet's associate name (web_clients.sheet_associate_name)
//    is the web SEO manager's name (Ammar / Sikandar).
//  - Writers managers have every client.
export const SEO_SUPPORT_RANGES = [
  { managerName: 'M Hussain', from: 1, to: 5 },
  { managerName: 'Talha', from: 6, to: 10 },
];

const norm = (s) => String(s || '').trim().toLowerCase();

// Returns { clientNames: sorted roster of every SEO + web client,
//           owners: { [lowercased client name]: [managerId, ...] } }.
// Writers managers are not listed per client — callers treat them as owning all.
export async function getClientOwnership(db, managers) {
  const byName = new Map(managers.map((m) => [norm(m.name), m.id]));
  const owners = new Map();
  const names = new Map(); // lower -> display name
  const add = (client, managerId) => {
    const key = norm(client);
    if (!names.has(key)) names.set(key, String(client).trim());
    if (managerId == null) return;
    if (!owners.has(key)) owners.set(key, new Set());
    owners.get(key).add(managerId);
  };

  // Only clients currently on the sheets: active rows of the active SEO / web
  // campaign. Clients dropped from the sheet get deactivated by the daily sync
  // and so fall out of the roster (their old reports keep the name).
  const seo = await db.prepare(`
    SELECT TRIM(c.name) AS name, c.support_number FROM clients c
    JOIN campaigns cp ON cp.id = c.campaign_id
    WHERE cp.status = 'active' AND c.is_active = 1 AND c.name IS NOT NULL AND TRIM(c.name) != ''
  `).all();
  for (const c of seo) {
    const range = c.support_number == null ? null : SEO_SUPPORT_RANGES.find((r) => c.support_number >= r.from && c.support_number <= r.to);
    add(c.name, range ? byName.get(norm(range.managerName)) : null);
  }

  const web = await db.prepare(`
    SELECT TRIM(w.name) AS name, w.sheet_associate_name FROM web_clients w
    JOIN webseo_campaigns wc ON wc.id = w.webseo_campaign_id
    WHERE wc.status = 'active' AND w.is_active = 1 AND w.name IS NOT NULL AND TRIM(w.name) != ''
  `).all();
  for (const c of web) add(c.name, c.sheet_associate_name ? byName.get(norm(c.sheet_associate_name)) : null);

  return {
    clientNames: [...names.values()].sort((a, b) => a.localeCompare(b)),
    owners: Object.fromEntries([...owners].map(([k, v]) => [k, [...v]])),
  };
}

// Of the chosen clients, the ones this manager should get the issue for.
export function clientsForManager(manager, clientNames, owners) {
  if (manager.role === 'writers_manager') return clientNames;
  return clientNames.filter((c) => (owners[norm(c)] || []).includes(manager.id));
}
