import { db } from '../firebase/admin';
import { GmailService } from '../services/gmail';
import { DriveService } from '../services/drive';
import { SheetsService } from '../services/sheets';
import { InvoiceProcessor } from '../services/invoiceProcessor';
import { UserData } from '../types/user';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export class EmailChecker {
  private gmailService: GmailService;
  private driveService: DriveService;
  private sheetsService: SheetsService;
  private invoiceProcessor: InvoiceProcessor;

  constructor() {
    this.gmailService = new GmailService();
    this.driveService = new DriveService();
    this.sheetsService = new SheetsService();
    this.invoiceProcessor = new InvoiceProcessor();
  }

  async checkAllUsers(): Promise<void> {
    console.log('Starting email check for all users...');
    
    try {
      // Get all active users from Firestore
      const usersSnapshot = await db.collection('users')
        .where('isActive', '==', true)
        .get();

      if (usersSnapshot.empty) {
        console.log('No active users found');
        return;
      }

      console.log(`Found ${usersSnapshot.size} active users`);

      // Process each user
      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data() as UserData;
        
        if (!userData.sheetId || !userData.emailLabel) {
          console.log(`Skipping user ${userData.email} - missing configuration`);
          continue;
        }

        try {
          await this.processUserEmails(userData);
        } catch (error) {
          console.error(`Error processing user ${userData.email}:`, error);
          // Continue with other users even if one fails
        }
      }

      console.log('Email check completed for all users');
    } catch (error) {
      console.error('Error in email check:', error);
      throw error;
    }
  }

  public async processUserEmails(userData: UserData): Promise<void> {
    console.log(`Processing emails for user: ${userData.email}`);
    
    try {
      // Get emails with the specified label
      const messages = await this.gmailService.getEmailsWithLabel(userData, userData.emailLabel);
      
      if (messages.length === 0) {
        console.log(`No new emails found for user ${userData.email}`);
        return;
      }

      console.log(`Found ${messages.length} emails to process for user ${userData.email}`);

      // Get authenticated client for this user
      const auth = await this.gmailService.getAuthenticatedClient(userData);
      
      // Process each email
      for (const message of messages) {
        try {
          await this.processEmail(auth, userData, message.id!);
        } catch (error) {
          console.error(`Error processing email ${message.id} for user ${userData.email}:`, error);
          // Continue with other emails
        }
      }

      // Update last processed time
      await this.updateLastProcessed(userData.uid);

    } catch (error) {
      console.error(`Error processing emails for user ${userData.email}:`, error);
      throw error;
    }
  }

  private async processEmail(auth: OAuth2Client, userData: UserData, messageId: string): Promise<void> {
    console.log(`Processing email ${messageId} for user ${userData.email}`);
    
    try {
      // Get message details
      const messageDetails = await this.gmailService.getMessageDetails(auth, messageId);
      
      // Check for attachments
      const attachments = this.extractAttachments(messageDetails);
      if (attachments.length === 0) {
        console.log(`No attachments found in email ${messageId}`);
        return;
      }

      console.log(`Found ${attachments.length} attachments in email ${messageId}`);

      // Process each attachment
      for (const attachment of attachments) {
        try {
          // Download attachment
          const fileBuffer = await this.gmailService.downloadAttachment(
            auth, 
            messageId, 
            attachment.attachmentId
          );

          // Upload to Drive
          const driveUrl = await this.driveService.uploadFile(
            auth,
            attachment.filename,
            fileBuffer,
            attachment.mimeType
          );

          // Add to source sheet
          await this.sheetsService.appendSourceLink(
            auth,
            userData.sheetId,
            driveUrl
          );

          console.log(`Successfully processed attachment ${attachment.filename}`);
          
          // Process the invoice using your existing logic
          await this.invoiceProcessor.processInvoices(auth, userData.sheetId);

        } catch (error) {
          console.error(`Error processing attachment ${attachment.filename}:`, error);
          // Continue with other attachments
        }
      }

      // Mark email as processed
      const labelId = await this.getLabelId(auth, userData.emailLabel);
      if (labelId) {
        await this.gmailService.markAsProcessed(auth, messageId, labelId);
      }

    } catch (error) {
      console.error(`Error processing email ${messageId}:`, error);
      throw error;
    }
  }

  private extractAttachments(messageDetails: any): Array<{
    attachmentId: string;
    filename: string;
    mimeType: string;
  }> {
    const attachments: Array<{
      attachmentId: string;
      filename: string;
      mimeType: string;
    }> = [];

    const payload = messageDetails.payload;
    if (!payload) return attachments;

    // Recursively search for attachments
    const searchParts = (parts: any[]) => {
      for (const part of parts) {
        if (part.filename && part.body?.attachmentId) {
          attachments.push({
            attachmentId: part.body.attachmentId,
            filename: part.filename,
            mimeType: part.mimeType || 'application/octet-stream'
          });
        }
        
        if (part.parts) {
          searchParts(part.parts);
        }
      }
    };

    if (payload.parts) {
      searchParts(payload.parts);
    }

    return attachments;
  }

  private async getLabelId(auth: OAuth2Client, labelName: string): Promise<string | null> {
    try {
      const gmail = google.gmail({ version: 'v1', auth });
      const response = await gmail.users.labels.list({ userId: 'me' });
      const labels = response.data.labels || [];
      const label = labels.find(l => l.name === labelName);
      return label?.id || null;
    } catch (error) {
      console.error(`Error getting label ID for ${labelName}:`, error);
      return null;
    }
  }

  private async updateLastProcessed(uid: string): Promise<void> {
    try {
      await db.collection('users').doc(uid).update({
        lastProcessed: new Date()
      });
    } catch (error) {
      console.error(`Error updating last processed time for user ${uid}:`, error);
    }
  }
}
