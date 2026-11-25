// The QA "client window": every active client of one kind ('seo' | 'web') that has links, with all of
// its links (any day) grouped by link type. Pass / Fail marks live in qa_link_checks (one row per
// kind + client + URL), the same rows the associates pages read and write — so a mark made in either
// place shows in the other.
export async function loadClientLinks(db, kind) {
  const isWeb = kind === 'web';
  const linkTable = isWeb ? 'synced_web_client_links' : 'synced_client_links';
  const clientTable = isWeb ? 'web_clients' : 'clients';

  const clients = await db.prepare(`
    SELECT c.id, TRIM(c.name) AS name, c.assigned_associate_id, c.${isWeb ? 'webseo_campaign_id' : 'campaign_id'} AS campaign_id, ${isWeb ? 'c.sheet_url AS sheet_url' : 'NULL AS sheet_url'}
    FROM ${clientTable} c
    WHERE c.is_active = 1 AND EXISTS (SELECT 1 FROM ${linkTable} l WHERE l.client_id = c.id)
    ORDER BY LOWER(TRIM(c.name))
  `).all();
  if (clients.length === 0) return { campaigns: [], clients: [] };

  const links = await db.prepare(`
    SELECT client_id, url, task_date, link_type, seeded FROM ${linkTable} ORDER BY task_date DESC, id
  `).all();

  // Who did each link: the associate on the task of that client + day + type; older (seeded) links
  // fall back to the client's assigned associate.
  const taskRows = await db.prepare(
    isWeb
      ? 'SELECT client_id, task_date, post_type AS link_type, associate_id FROM webseo_tasks WHERE completed_count > 0'
      : 'SELECT client_id, task_date, link_type, associate_id FROM seo_tasks WHERE completed_count > 0'
  ).all();
  const doneBy = new Map(taskRows.map((t) => [`${t.client_id}|${t.task_date}|${t.link_type}`, t.associate_id]));

  const users = await db.prepare('SELECT id, name FROM users').all();
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  const checks = new Map();
  for (const c of await db.prepare('SELECT client_id, url, status FROM qa_link_checks WHERE kind = ?').all(kind)) {
    checks.set(`${c.client_id}|${c.url}`, c.status);
  }

  const byClient = new Map(clients.map((c) => [c.id, {
    clientId: c.id, campaignId: c.campaign_id, name: c.name, sheetUrl: c.sheet_url || null, assignedId: c.assigned_associate_id || null, types: new Map(), total: 0,
  }]));
  for (const l of links) {
    const c = byClient.get(l.client_id);
    if (!c) continue;
    const type = l.link_type || 'other';
    const associateId = (l.task_date && doneBy.get(`${l.client_id}|${l.task_date}|${l.link_type}`)) || c.assignedId || null;
    if (!c.types.has(type)) c.types.set(type, []);
    c.types.get(type).push({
      url: l.url,
      status: checks.get(`${l.client_id}|${l.url}`) || '',
      date: l.task_date || null,
      associateId,
      associateName: associateId ? nameOf.get(associateId) || null : null,
    });
    c.total += 1;
  }

  // Each month is its own campaign (clients are copied per campaign), newest first.
  const campaignRows = await db.prepare(`SELECT id, name, start_date FROM ${isWeb ? 'webseo_campaigns' : 'campaigns'} ORDER BY start_date DESC, id DESC`).all();
  const used = new Set(clients.map((c) => c.campaign_id));
  const campaigns = campaignRows.filter((r) => used.has(r.id)).map((r) => ({ id: r.id, name: r.name, startDate: r.start_date }));

  const list = [...byClient.values()].map((c) => ({
    clientId: c.clientId,
    campaignId: c.campaignId,
    name: c.name,
    sheetUrl: c.sheetUrl,
    total: c.total,
    types: [...c.types.entries()].map(([type, list]) => ({ type, count: list.length, links: list })),
  }));
  return { campaigns, clients: list };
}
