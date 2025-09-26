import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export class SheetsService {
  async appendSourceLink(auth: OAuth2Client, sheetId: string, fileUrl: string): Promise<void> {
    const sheets = google.sheets({ version: 'v4', auth });
    
    try {
      // Append the file URL to the source sheet
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: 'A:A', // Append to column A
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [[fileUrl]]
        }
      });

      console.log(`Added file URL to sheet ${sheetId}: ${fileUrl}`);
    } catch (error) {
      console.error(`Error appending link to sheet ${sheetId}:`, error);
      throw error;
    }
  }
}
