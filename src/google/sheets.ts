import { google } from 'googleapis';
import { env } from '../config/env';
import { INVOICE_HEADERS, LINE_HEADERS, SHEETS } from '../config/constants';
import { getGoogleAuth } from './auth';

const sheetsApi = google.sheets('v4');

export async function ensureHeaders() {
  try {
    const auth = getGoogleAuth();
    console.log(`Ensuring headers in target sheet: ${SHEETS.target.id}`);
    // Invoices tab
    await ensureHeaderRow(SHEETS.target.id, SHEETS.target.invoicesTab, INVOICE_HEADERS, auth);
    console.log(`Headers ensured for ${SHEETS.target.invoicesTab} tab`);
    // Line items tab
    await ensureHeaderRow(SHEETS.target.id, SHEETS.target.linesTab, LINE_HEADERS, auth);
    console.log(`Headers ensured for ${SHEETS.target.linesTab} tab`);
  } catch (error: any) {
    console.error('Failed to ensure headers:', error.message);
    if (error.response?.status === 401) {
      console.error('401 Unauthorized - Check if service account has access to target sheet');
    }
    throw error;
  }
}

async function ensureHeaderRow(spreadsheetId: string, tab: string, headers: string[], auth: any) {
  const range = `${tab}!1:1`;
  const res = await sheetsApi.spreadsheets.values.get({ auth, spreadsheetId, range });
  const existing = res.data.values?.[0] ?? [];
  if (existing.length === 0) {
    await sheetsApi.spreadsheets.values.update({
      auth,
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
  }
}

export async function readSourceLinks(): Promise<string[]> {
  try {
    const auth = getGoogleAuth();
    const range = `${SHEETS.source.tab}!1:99999`;
    console.log(`Reading from sheet: ${SHEETS.source.id}, range: ${range}`);
    const res = await sheetsApi.spreadsheets.values.get({ auth, spreadsheetId: SHEETS.source.id, range });
    const rows = res.data.values ?? [];
    if (rows.length === 0) return [];
    const header = rows[0];
    const colIndex = header.findIndex(h => (h || '').trim() === SHEETS.source.linkColumn);
    if (colIndex === -1) {
      console.error(`Column '${SHEETS.source.linkColumn}' not found in headers:`, header);
      return [];
    }
    const links: string[] = [];
    for (let i = 1; i < rows.length; i++) {
      const cell = rows[i][colIndex];
      if (cell && typeof cell === 'string' && cell.trim().length > 0) links.push(cell.trim());
    }
    console.log(`Found ${links.length} links in source sheet`);
    return links;
  } catch (error: any) {
    console.error('Failed to read source links:', error.message);
    if (error.response?.status === 401) {
      console.error('401 Unauthorized - Check if service account has access to source sheet');
    }
    throw error;
  }
}

export async function upsertInvoices(invoices: Record<string,string>[]) {
  if (invoices.length === 0) return;
  const auth = getGoogleAuth();
  const spreadsheetId = SHEETS.target.id;
  const tab = SHEETS.target.invoicesTab;
  const readRange = `${tab}!1:999999`;
  const res = await sheetsApi.spreadsheets.values.get({ auth, spreadsheetId, range: readRange });
  const rows = res.data.values ?? [];
  const header = rows[0] ?? INVOICE_HEADERS;
  const keyIdx = header.indexOf('invoice_key');

  // Build existing index
  const index = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    const key = rows[i][keyIdx];
    if (key) index.set(key, i + 1); // 1-based rows
  }

  // Prepare updates and appends
  const updates: { range: string; values: any[][] }[] = [];
  const appends: any[][] = [];
  for (const inv of invoices) {
    const row = header.map(h => inv[h] ?? '');
    const key = inv['invoice_key'];
    const existingRow = key ? index.get(key) : undefined;
    if (existingRow) {
      updates.push({ range: `${tab}!A${existingRow}`, values: [row] });
    } else {
      appends.push(row);
    }
  }

  // Batch update
  if (updates.length > 0) {
    await sheetsApi.spreadsheets.values.batchUpdate({
      auth,
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: updates,
      },
    });
  }
  // Append
  if (appends.length > 0) {
    await sheetsApi.spreadsheets.values.append({
      auth,
      spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: appends },
    });
  }
}

export async function appendLineItems(lines: Record<string,string>[]) {
  if (lines.length === 0) return;
  const auth = getGoogleAuth();
  await sheetsApi.spreadsheets.values.append({
    auth,
    spreadsheetId: SHEETS.target.id,
    range: `${SHEETS.target.linesTab}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: lines.map(line => LINE_HEADERS.map(h => line[h] ?? '')) },
  });
}
