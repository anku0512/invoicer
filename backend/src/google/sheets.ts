import { google } from 'googleapis';
import { env } from '../config/env';
import { INVOICE_HEADERS, LINE_HEADERS, SHEETS } from '../config/constants';
import { getGoogleAuth } from './auth';

const sheetsApi = google.sheets('v4');

export async function ensureHeaders(sheetId?: string) {
  try {
    const auth = getGoogleAuth();
    const targetSheetId = sheetId || SHEETS.target.id;
    if (!targetSheetId) {
      throw new Error('TARGET_SHEET_ID is not configured');
    }
    console.log(`Ensuring headers in target sheet: ${targetSheetId}`);
    
    // First, try to get the sheet info to see what tabs exist
    try {
      const sheetInfo = await sheetsApi.spreadsheets.get({ auth, spreadsheetId: targetSheetId });
      const existingTabs = sheetInfo.data.sheets?.map(sheet => sheet.properties?.title) || [];
      console.log(`Existing tabs in sheet: ${existingTabs.join(', ')}`);
      
      // Use existing tabs or fall back to configured names
      const invoicesTab = existingTabs.includes('Invoices') ? 'Invoices' : 
                         existingTabs.includes('Sheet1') ? 'Sheet1' : 
                         existingTabs[0] || SHEETS.target.invoicesTab;
      const linesTab = existingTabs.includes('Invoice Line Items') ? 'Invoice Line Items' : 
                      existingTabs.includes('Sheet2') ? 'Sheet2' : 
                      existingTabs[1] || SHEETS.target.linesTab;
      
      console.log(`Using invoices tab: ${invoicesTab}`);
      console.log(`Using line items tab: ${linesTab}`);
      
      // Ensure headers for invoices tab
      await ensureHeaderRow(targetSheetId, invoicesTab, INVOICE_HEADERS, auth);
      console.log(`✅ Headers ensured for ${invoicesTab} tab`);
      
      // Ensure headers for line items tab (only if it's different from invoices tab)
      if (invoicesTab !== linesTab) {
        await ensureHeaderRow(targetSheetId, linesTab, LINE_HEADERS, auth);
        console.log(`✅ Headers ensured for ${linesTab} tab`);
      }
      
    } catch (sheetError: any) {
      console.error('Error accessing sheet info:', sheetError.message);
      // Fallback: use configured tab names
      console.log('Falling back to configured tab names...');
      const invoicesTab = SHEETS.target.invoicesTab;
      const linesTab = SHEETS.target.linesTab;
      
      await ensureHeaderRow(targetSheetId, invoicesTab, INVOICE_HEADERS, auth);
      console.log(`✅ Headers ensured for ${invoicesTab} tab`);
      
      if (invoicesTab !== linesTab) {
        await ensureHeaderRow(targetSheetId, linesTab, LINE_HEADERS, auth);
        console.log(`✅ Headers ensured for ${linesTab} tab`);
      }
    }
    
  } catch (error: any) {
    console.error('Failed to ensure headers:', error.message);
    if (error.response?.status === 401) {
      console.error('401 Unauthorized - Check if service account has access to target sheet');
    } else if (error.response?.status === 404) {
      console.error('404 Not Found - Check if sheet ID is correct and sheet exists');
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

export async function upsertInvoices(invoices: Record<string,string>[], sheetId?: string) {
  if (invoices.length === 0) return;
  const auth = getGoogleAuth();
  const spreadsheetId = sheetId || SHEETS.target.id;
  if (!spreadsheetId) {
    throw new Error('Sheet ID is not provided and TARGET_SHEET_ID is not configured');
  }
  
  console.log(`🔍 Debug: spreadsheetId=${spreadsheetId}`);
  console.log(`🔍 Debug: auth type=${auth.constructor.name}`);
  
  // Detect the correct tab name (same logic as ensureHeaders)
  let tab = SHEETS.target.invoicesTab;
  console.log(`🔍 Debug: Initial tab from config: ${tab}`);
  
  try {
    console.log(`🔍 Debug: Attempting to get sheet info...`);
    const sheetInfo = await sheetsApi.spreadsheets.get({ auth, spreadsheetId });
    const existingTabs = sheetInfo.data.sheets?.map(sheet => sheet.properties?.title) || [];
    console.log(`🔍 Debug: Existing tabs: ${existingTabs.join(', ')}`);
    
    // Use existing tabs or fall back to configured names
    if (existingTabs.includes('Invoices')) {
      tab = 'Invoices';
      console.log(`🔍 Debug: Found 'Invoices' tab, using it`);
    } else if (existingTabs.includes('Sheet1')) {
      tab = 'Sheet1';
      console.log(`🔍 Debug: Found 'Sheet1' tab, using it`);
    } else if (existingTabs.length > 0) {
      tab = existingTabs[0] || SHEETS.target.invoicesTab;
      console.log(`🔍 Debug: Using first available tab: ${tab}`);
    } else {
      console.log(`🔍 Debug: No tabs found, using configured: ${tab}`);
    }
  } catch (error: any) {
    console.log(`🔍 Debug: Could not detect tabs, using configured: ${tab}`);
    console.log(`🔍 Debug: Error was: ${error.message}`);
  }
  
  console.log(`🔍 Debug: Final tab to use: ${tab}`);
  
  const readRange = `${tab}!1:999999`;
  console.log(`🔍 Debug: Reading range: ${readRange}`);
  
  const res = await sheetsApi.spreadsheets.values.get({ auth, spreadsheetId, range: readRange });
  const rows = res.data.values ?? [];
  const header = rows[0] ?? INVOICE_HEADERS;
  const keyIdx = header.indexOf('invoice_key');
  
  console.log(`🔍 Debug: Found ${rows.length} rows, header has ${header.length} columns`);

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
    console.log(`🔍 Debug: Performing ${updates.length} updates`);
    try {
      await sheetsApi.spreadsheets.values.batchUpdate({
        auth,
        spreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: updates,
        },
      });
      console.log(`✅ Debug: Batch update successful`);
    } catch (error: any) {
      console.error(`❌ Debug: Batch update failed:`, error.message);
      throw error;
    }
  }
  // Append
  if (appends.length > 0) {
    console.log(`🔍 Debug: Performing ${appends.length} appends`);
    try {
      await sheetsApi.spreadsheets.values.append({
        auth,
        spreadsheetId,
        range: `${tab}!A1`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: appends },
      });
      console.log(`✅ Debug: Append successful`);
    } catch (error: any) {
      console.error(`❌ Debug: Append failed:`, error.message);
      throw error;
    }
  }
}

export async function appendLineItems(lines: Record<string,string>[], sheetId?: string) {
  if (lines.length === 0) return;
  const auth = getGoogleAuth();
  const spreadsheetId = sheetId || SHEETS.target.id;
  if (!spreadsheetId) {
    throw new Error('Sheet ID is not provided and TARGET_SHEET_ID is not configured');
  }
  
  // Detect the correct tab name (same logic as ensureHeaders)
  let linesTab = SHEETS.target.linesTab;
  try {
    const sheetInfo = await sheetsApi.spreadsheets.get({ auth, spreadsheetId });
    const existingTabs = sheetInfo.data.sheets?.map(sheet => sheet.properties?.title) || [];
    console.log(`🔍 Debug: Existing tabs for line items: ${existingTabs.join(', ')}`);
    
    // Use existing tabs or fall back to configured names
    if (existingTabs.includes('Invoice Line Items')) {
      linesTab = 'Invoice Line Items';
      console.log(`🔍 Debug: Found 'Invoice Line Items' tab, using it`);
    } else if (existingTabs.includes('Sheet2')) {
      linesTab = 'Sheet2';
      console.log(`🔍 Debug: Found 'Sheet2' tab, using it`);
    } else if (existingTabs.length > 1) {
      linesTab = existingTabs[1] || SHEETS.target.linesTab;
      console.log(`🔍 Debug: Using second available tab: ${linesTab}`);
    } else {
      console.log(`🔍 Debug: Using configured line items tab: ${linesTab}`);
    }
  } catch (error: any) {
    console.log(`🔍 Debug: Could not detect line items tab, using configured: ${linesTab}`);
  }
  
  console.log(`🔍 Debug: Using line items tab: ${linesTab}`);
  
  await sheetsApi.spreadsheets.values.append({
    auth,
    spreadsheetId,
    range: `${linesTab}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: lines.map(line => LINE_HEADERS.map(h => line[h] ?? '')) },
  });
}