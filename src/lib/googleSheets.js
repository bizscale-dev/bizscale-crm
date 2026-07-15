export function parseGoogleSheetUrl(url) {
  const trimmed = url.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return null;

  const spreadsheetId = match[1];
  let gid = '0';
  const gidMatch = trimmed.match(/[?&#]gid=(\d+)/);
  if (gidMatch) gid = gidMatch[1];

  return {
    spreadsheetId,
    gid,
    exportUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`,
  };
}

export function columnLetterToIndex(letter) {
  const col = letter.trim().toUpperCase();
  if (!col || !/^[A-Z]+$/.test(col)) return null;

  let index = 0;
  for (let i = 0; i < col.length; i++) {
    index = index * 26 + (col.charCodeAt(i) - 64);
  }
  return index - 1;
}

export function parseCsv(text) {
  const normalized = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const next = normalized[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r' && next === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else if (char === '\n' || char === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((cell) => cell !== '')) {
    rows.push(row);
  }

  return rows;
}

export async function fetchGoogleSheetRows(exportUrl) {
  const res = await fetch(exportUrl, {
    redirect: 'follow',
    headers: { 'User-Agent': 'BizscaleCRM/1.0' },
  });

  if (!res.ok) {
    throw new Error(
      `Could not fetch sheet (HTTP ${res.status}). Make sure the sheet is shared as "Anyone with the link can view".`
    );
  }

  const text = await res.text();
  if (text.includes('<!DOCTYPE html') || text.includes('<html')) {
    throw new Error(
      'Sheet is not publicly accessible. Share it as "Anyone with the link can view" and try again.'
    );
  }

  const rows = parseCsv(text);
  if (rows.length === 0) {
    throw new Error('The sheet appears to be empty.');
  }

  return rows;
}

export function extractClientsFromRows(rows, nameColIndex, websiteColIndex, skipHeader) {
  const startRow = skipHeader ? 1 : 0;
  const clients = [];

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    const name = (row[nameColIndex] || '').trim();
    if (!name) continue;

    const website =
      websiteColIndex != null ? (row[websiteColIndex] || '').trim() : '';

    clients.push({ name, website });
  }

  return clients;
}
