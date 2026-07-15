import {
  columnLetterToIndex,
  extractClientsFromRows,
  fetchGoogleSheetRows,
  parseGoogleSheetUrl,
} from '@/lib/googleSheets';

export async function insertClients(db, campaignId, clients) {
  const insertAll = db.transaction(async (tx, items) => {
    const existingCount = (await tx
      .prepare('SELECT COUNT(*) as c FROM clients WHERE campaign_id = ?')
      .get(campaignId)).c;

    for (let i = 0; i < items.length; i++) {
      const { name, website } = items[i];
      await tx
        .prepare('INSERT INTO clients (campaign_id, name, website, sort_order) VALUES (?, ?, ?, ?)')
        .run(campaignId, name, website, existingCount + i + 1);
    }
  });

  await insertAll(clients);
  return clients.length;
}

export async function importClientsFromSheetFormData(formData) {
  const sheetUrl = formData.get('sheet_url');
  const nameColumn = formData.get('name_column');
  const websiteColumn = formData.get('website_column');
  const skipHeader = formData.get('skip_header') === 'on';

  const parsed = parseGoogleSheetUrl(sheetUrl);
  if (!parsed) {
    return { error: 'Invalid Google Sheets URL. Paste the full link from your browser.' };
  }

  const nameColIndex = columnLetterToIndex(nameColumn);
  if (nameColIndex == null) {
    return { error: 'Invalid client name column. Use a letter like A, B, or C.' };
  }

  let websiteColIndex = null;
  if (websiteColumn && websiteColumn.trim()) {
    websiteColIndex = columnLetterToIndex(websiteColumn);
    if (websiteColIndex == null) {
      return { error: 'Invalid website column. Use a letter like B or C, or leave it blank.' };
    }
  }

  try {
    const rows = await fetchGoogleSheetRows(parsed.exportUrl);
    const clients = extractClientsFromRows(rows, nameColIndex, websiteColIndex, skipHeader);

    if (clients.length === 0) {
      return {
        error: 'No clients found in the selected column. Check the column letter and header setting.',
      };
    }

    return { clients };
  } catch (err) {
    return { error: err.message };
  }
}
