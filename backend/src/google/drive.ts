import { google } from 'googleapis';
import { getGoogleAuth } from './auth';

export async function downloadDriveFile(fileId: string, auth?: any): Promise<{ buffer: Buffer; fileName: string; mimeType: string; }>{
  try {
    if (!auth) {
      throw new Error('User authentication required. Please complete Google OAuth flow first.');
    }
    const drive = google.drive({ version: 'v3', auth });
    console.log(`Downloading Drive file: ${fileId}`);
    const file = await drive.files.get({ fileId, fields: 'id,name,mimeType' });
    const fileName = file.data.name || fileId;
    const mimeType = file.data.mimeType || 'application/octet-stream';
    console.log(`File name: ${fileName}, MIME type: ${mimeType}`);
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(res.data as ArrayBuffer);
    console.log(`Downloaded ${buffer.length} bytes`);
    return { buffer, fileName, mimeType };
  } catch (error: any) {
    console.error(`Failed to download Drive file ${fileId}:`, error.message);
    if (error.response?.status === 401) {
      console.error('401 Unauthorized - Check if service account has access to Drive file');
    }
    if (error.response?.status === 404) {
      console.error('404 Not Found - Check if file ID is correct and file exists');
    }
    throw error;
  }
}
