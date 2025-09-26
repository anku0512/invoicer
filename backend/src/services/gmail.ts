import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { UserData } from '../types/user';

export class GmailService {
  private oauth2Client: OAuth2Client;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob'
    );
  }

  async getAuthenticatedClient(userData: UserData): Promise<OAuth2Client> {
    this.oauth2Client.setCredentials({
      refresh_token: userData.refreshToken,
      access_token: userData.accessToken,
    });

    // Refresh token if needed
    if (userData.tokenExpiry && Date.now() >= userData.tokenExpiry) {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      this.oauth2Client.setCredentials(credentials);
    }

    return this.oauth2Client;
  }

  async getEmailsWithLabel(userData: UserData, labelName: string): Promise<any[]> {
    const auth = await this.getAuthenticatedClient(userData);
    const gmail = google.gmail({ version: 'v1', auth });

    try {
      // First, get the label ID
      const labelsResponse = await gmail.users.labels.list({ userId: 'me' });
      const labels = labelsResponse.data.labels || [];
      const targetLabel = labels.find(label => label.name === labelName);
      
      if (!targetLabel) {
        console.log(`Label "${labelName}" not found for user ${userData.email}`);
        return [];
      }

      // Search for messages with this label
      const messagesResponse = await gmail.users.messages.list({
        userId: 'me',
        labelIds: [targetLabel.id!],
        maxResults: 10
      });

      const messages = messagesResponse.data.messages || [];
      console.log(`Found ${messages.length} messages with label "${labelName}" for user ${userData.email}`);

      return messages;
    } catch (error) {
      console.error(`Error fetching emails for user ${userData.email}:`, error);
      throw error;
    }
  }

  async getMessageDetails(auth: OAuth2Client, messageId: string): Promise<any> {
    const gmail = google.gmail({ version: 'v1', auth });
    
    try {
      const message = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      return message.data;
    } catch (error) {
      console.error(`Error fetching message details for ${messageId}:`, error);
      throw error;
    }
  }

  async downloadAttachment(auth: OAuth2Client, messageId: string, attachmentId: string): Promise<Buffer> {
    const gmail = google.gmail({ version: 'v1', auth });
    
    try {
      const attachment = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachmentId
      });

      const data = attachment.data.data;
      if (!data) {
        throw new Error('No attachment data found');
      }

      return Buffer.from(data, 'base64');
    } catch (error) {
      console.error(`Error downloading attachment ${attachmentId}:`, error);
      throw error;
    }
  }

  async markAsProcessed(auth: OAuth2Client, messageId: string, originalLabelId: string): Promise<void> {
    const gmail = google.gmail({ version: 'v1', auth });
    
    try {
      // Remove the original label and add a processed label
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: [originalLabelId],
          addLabelIds: ['INBOX'] // Keep in inbox but remove the processing label
        }
      });
      
      console.log(`Marked message ${messageId} as processed`);
    } catch (error) {
      console.error(`Error marking message ${messageId} as processed:`, error);
      throw error;
    }
  }
}
