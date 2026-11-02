// Every client that was in an SEO campaign, with their progress in it — shown on the
// campaign's report page (/admin/campaign/[id]). When a campaign is marked completed
// the list is frozen into campaign_client_archive (see snapshotCampaignClients), so the
// archive keeps exactly who was in the campaign and how far each client got, whatever
// happens to the clients afterwards. Campaigns completed before the snapshot existed
// (and campaigns still running) are read live from clients + seo_tasks.

export async function getLiveCampaignClients(db, campaignId) {
  const clients = await db.prepare(`
    SELECT c.id, c.name, c.website, c.is_active, c.tunnel_status, c.funnel_month,
      ua.name as associate, uw.name as writer
    FROM clients c
    LEFT JOIN users ua ON ua.id = c.assigned_associate_id
    LEFT JOIN users uw ON uw.id = c.assigned_writer_id
    WHERE c.campaign_id = ?
    ORDER BY c.sort_order, c.id
  `).all(campaignId);

  const taskRows = await db.prepare(`
    SELECT client_id, link_type, COALESCE(SUM(target_count), 0) as target, COALESCE(SUM(completed_count), 0) as completed
    FROM seo_tasks WHERE campaign_id = ? GROUP BY client_id, link_type
  `).all(campaignId);
  const byClient = new Map();
  for (const r of taskRows) {
    if (!byClient.has(r.client_id)) byClient.set(r.client_id, {});
    byClient.get(r.client_id)[r.link_type] = { target: r.target, completed: r.completed };
  }

  return clients.map((c) => {
    const byType = byClient.get(c.id) || {};
    const types = Object.values(byType);
    return {
      id: c.id,
      name: c.name,
      website: c.website,
      associate: c.associate,
      writer: c.writer,
      isActive: !!c.is_active,
      tunnelStatus: c.tunnel_status,
      funnelMonth: c.funnel_month,
      target: types.reduce((s, t) => s + t.target, 0),
      completed: types.reduce((s, t) => s + t.completed, 0),
      byType,
    };
  });
}

// The frozen list, or null when this campaign was never archived.
export async function getArchivedCampaignClients(db, campaignId) {
  const rows = await db.prepare(`
    SELECT client_id, name, website, associate, writer, is_active, tunnel_status, funnel_month,
      target, completed, by_type, archived_at
    FROM campaign_client_archive WHERE campaign_id = ? ORDER BY position
  `).all(campaignId);
  if (rows.length === 0) return null;
  return {
    archivedAt: rows[0].archived_at,
    clients: rows.map((r) => ({
      id: r.client_id,
      name: r.name,
      website: r.website,
      associate: r.associate,
      writer: r.writer,
      isActive: !!r.is_active,
      tunnelStatus: r.tunnel_status,
      funnelMonth: r.funnel_month,
      target: r.target,
      completed: r.completed,
      byType: JSON.parse(r.by_type || '{}'),
    })),
  };
}

// Freezes the campaign's current client list and progress. Re-running replaces the
// previous snapshot.
export async function snapshotCampaignClients(db, campaignId) {
  const clients = await getLiveCampaignClients(db, campaignId);
  await db.prepare('DELETE FROM campaign_client_archive WHERE campaign_id = ?').run(campaignId);
  const statements = clients.map((c, position) => ({
    sql: `INSERT INTO campaign_client_archive
      (campaign_id, client_id, position, name, website, associate, writer, is_active, tunnel_status, funnel_month, target, completed, by_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [campaignId, c.id, position, c.name, c.website || null, c.associate || null, c.writer || null,
      c.isActive ? 1 : 0, c.tunnelStatus || null, c.funnelMonth ?? null, c.target, c.completed, JSON.stringify(c.byType)],
  }));
  for (let i = 0; i < statements.length; i += 200) {
    await db.batch(statements.slice(i, i + 200));
  }
  return clients.length;
}
