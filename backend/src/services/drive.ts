import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export class DriveService {
  async uploadFile(auth: OAuth2Client, fileName: string, fileBuffer: Buffer, mimeType: string): Promise<string> {
    const drive = google.drive({ version: 'v3', auth });
    
    try {
      const response = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [] // Upload to root directory
        },
        media: {
          mimeType,
          body: fileBuffer
        }
      });

      const fileId = response.data.id;
      if (!fileId) {
        throw new Error('No file ID returned from Drive upload');
      }

      // Make the file accessible via link
      await drive.permissions.create({
        fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        }
      });

      const fileUrl = `https://drive.google.com/file/d/${fileId}/view`;
      console.log(`Uploaded file ${fileName} to Drive: ${fileUrl}`);
      
      return fileUrl;
    } catch (error) {
      console.error(`Error uploading file ${fileName} to Drive:`, error);
      throw error;
    }
  }
}
