import { google } from 'googleapis';
import { getGoogleAuth } from '../google/auth';
import { env } from '../config/env';
import { FileTrackingService } from './fileTrackingService';
import { downloadDriveFile } from '../google/drive';
import { prepareTmp, isZip, writeZipAndExtract } from '../ingest/fileHandler';
import { uploadToLlamaParse, pollJob, getMarkdown } from '../ingest/llamaparse';
import { normalizeMarkdown, normalizeMarkdownBatch } from '../ai/normalize';
import { ensureHeaders, upsertInvoices, appendLineItems } from '../google/sheets';
import { Accumulator } from '../core/accumulator';
import { setUserAuth } from '../google/auth';
import fs from 'fs-extra';

export interface GoogleSheet {
  id: string;
  name: string;
  url: string;
  createdTime: string;
  modifiedTime: string;
}

export interface CreateSheetRequest {
  title: string;
  firebaseUid: string;
}

export interface CreateSheetResponse {
  success: boolean;
  sheetId: string;
  sheetUrl: string;
  error?: string;
}

export class WorkflowService {
  private sheetsApi = google.sheets('v4');
  private driveApi = google.drive({ version: 'v3' });
  private fileTrackingService = new FileTrackingService();

  /**
   * Fetch all Google Sheets accessible to the user
   */
  async getUserSheets(firebaseUid: string, userAuth: any): Promise<GoogleSheet[]> {
    try {
      // Search for Google Sheets files using user's auth
      const response = await this.driveApi.files.list({
        auth: userAuth,
        q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
        fields: 'files(id,name,webViewLink,createdTime,modifiedTime)',
        orderBy: 'modifiedTime desc',
        pageSize: 100
      });

      const sheets: GoogleSheet[] = (response.data.files || []).map(file => ({
        id: file.id!,
        name: file.name!,
        url: file.webViewLink!,
        createdTime: file.createdTime!,
        modifiedTime: file.modifiedTime!
      }));

      console.log(`Found ${sheets.length} Google Sheets for user ${firebaseUid}`);
      return sheets;
    } catch (error: any) {
      console.error('Error fetching user sheets:', error.message);
      throw new Error(`Failed to fetch Google Sheets: ${error.message}`);
    }
  }

  /**
   * Create a new Google Sheet with proper permissions
   */
  async createNewSheet(request: CreateSheetRequest, userAuth: any): Promise<CreateSheetResponse> {
    try {
      // Create the spreadsheet with user's OAuth (user owns the file)
      const spreadsheet = await this.sheetsApi.spreadsheets.create({
        auth: userAuth,
        requestBody: {
          properties: {
            title: request.title
          },
          sheets: [
            {
              properties: {
                title: 'Invoices',
                gridProperties: {
                  rowCount: 1000,
                  columnCount: 20
                }
              }
            },
            {
              properties: {
                title: 'Invoice Line Items',
                gridProperties: {
                  rowCount: 1000,
                  columnCount: 20
                }
              }
            }
          ]
        }
      });

      const sheetId = spreadsheet.data.spreadsheetId!;
      const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}`;

      console.log(`Created sheet ${sheetId} with user's account`);

      // Share with service account for processing
      const serviceAccountEmail = env.GOOGLE_CLIENT_EMAIL;
      if (serviceAccountEmail) {
        try {
          await this.driveApi.permissions.create({
            auth: userAuth,
            fileId: sheetId,
            requestBody: {
              role: 'writer',
              type: 'user',
              emailAddress: serviceAccountEmail
            }
          });
          console.log(`Shared sheet ${sheetId} with service account ${serviceAccountEmail}`);
        } catch (shareError: any) {
          console.error('Error sharing with service account:', shareError.message);
          // Continue anyway, the sheet is created
        }
      }

      console.log(`Created new sheet: ${request.title} (${sheetId})`);
      
      return {
        success: true,
        sheetId,
        sheetUrl
      };
    } catch (error: any) {
      console.error('Error creating new sheet:', error.message);
      return {
        success: false,
        sheetId: '',
        sheetUrl: '',
        error: error.message
      };
    }
  }

  /**
   * Add headers to the created sheet
   */
  private async addHeadersToSheet(sheetId: string, auth: any): Promise<void> {
    try {
      // Invoice headers
      const invoiceHeaders = [
        'invoice_key', 'supplier_name', 'invoice_number', 'invoice_date', 
        'invoice_total', 'currency', 'due_date', 'payment_terms', 
        'supplier_address', 'supplier_email', 'supplier_phone', 'notes'
      ];

      // Line item headers
      const lineHeaders = [
        'invoice_key', 'line_number', 'description', 'quantity', 
        'unit_price', 'line_amount', 'tax_rate', 'tax_amount'
      ];

      // Add headers to Invoices sheet
      await this.sheetsApi.spreadsheets.values.update({
        auth,
        spreadsheetId: sheetId,
        range: 'Invoices!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [invoiceHeaders]
        }
      });

      // Add headers to Invoice Line Items sheet
      await this.sheetsApi.spreadsheets.values.update({
        auth,
        spreadsheetId: sheetId,
        range: 'Invoice Line Items!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [lineHeaders]
        }
      });

      console.log(`Added headers to sheet ${sheetId}`);
    } catch (error: any) {
      console.error('Error adding headers to sheet:', error.message);
      // Don't throw here as the sheet was created successfully
    }
  }

  /**
   * Get files from a Google Drive folder
   */
  async getDriveFolderFiles(folderId: string, firebaseUid: string, userAuth: any): Promise<any[]> {
    try {
      if (!userAuth) {
        throw new Error('User authentication required. Please complete Google OAuth flow first.');
      }
      
      const allFiles: any[] = [];
      await this.recursivelyGetFiles(folderId, userAuth, allFiles);
      
      console.log(`Found ${allFiles.length} total files (including nested folders and zip contents)`);
      return allFiles;
    } catch (error: any) {
      console.error('Error fetching drive folder files:', error.message);
      throw new Error(`Failed to fetch drive folder files: ${error.message}`);
    }
  }

  private async recursivelyGetFiles(folderId: string, userAuth: any, allFiles: any[]): Promise<void> {
    try {
      // Get files and folders from the current folder
      const response = await this.driveApi.files.list({
        auth: userAuth,
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink)',
        orderBy: 'modifiedTime desc'
      });

      const items = response.data.files || [];
      console.log(`Found ${items.length} items in folder ${folderId}`);

      for (const item of items) {
        const mimeType = item.mimeType || '';
        
        // Check if it's a folder
        if (mimeType === 'application/vnd.google-apps.folder') {
          console.log(`Found folder: ${item.name}, recursively processing...`);
          await this.recursivelyGetFiles(item.id!, userAuth, allFiles);
        }
        // Check if it's a zip file
        else if (mimeType === 'application/zip' || item.name?.toLowerCase().endsWith('.zip')) {
          console.log(`Found zip file: ${item.name}, extracting contents...`);
          await this.processZipFile(item, userAuth, allFiles);
        }
        // Check if it's a supported file type
        else if (this.isSupportedFileType(item)) {
          console.log(`Found supported file: ${item.name}`);
          allFiles.push(item);
        }
        else {
          console.log(`Skipping unsupported file: ${item.name} (${mimeType})`);
        }
      }
    } catch (error: any) {
      console.error(`Error processing folder ${folderId}:`, error.message);
      // Continue processing other folders even if one fails
    }
  }

  private async processZipFile(zipFile: any, userAuth: any, allFiles: any[]): Promise<void> {
    try {
      // Download the zip file
      const fileData = await downloadDriveFile(zipFile.id!, userAuth);
      
      // Extract zip contents
      const extractedResult = await writeZipAndExtract(fileData.buffer);
      
      console.log(`Extracted ${extractedResult.files.length} files from zip: ${zipFile.name}`);
      
      // Add extracted files to the list
      for (const extractedFile of extractedResult.files) {
        // Create a virtual file object for the extracted file
        const virtualFile = {
          id: `extracted_${zipFile.id}_${extractedFile.fileName}`,
          name: extractedFile.fileName,
          mimeType: this.getMimeTypeFromFileName(extractedFile.fileName),
          size: extractedFile.filePath ? require('fs').statSync(extractedFile.filePath).size : 0,
          createdTime: zipFile.createdTime,
          modifiedTime: zipFile.modifiedTime,
          webViewLink: zipFile.webViewLink,
          isExtracted: true,
          originalZipId: zipFile.id,
          filePath: extractedFile.filePath
        };
        
        allFiles.push(virtualFile);
        console.log(`Added extracted file: ${extractedFile.fileName}`);
      }
    } catch (error: any) {
      console.error(`Error processing zip file ${zipFile.name}:`, error.message);
      // Continue processing other files even if zip extraction fails
    }
  }

  private isSupportedFileType(file: any): boolean {
    const mimeType = file.mimeType || '';
    const fileName = file.name || '';
    
    return mimeType.includes('pdf') || 
           mimeType.includes('image') || 
           fileName.toLowerCase().endsWith('.pdf') ||
           fileName.toLowerCase().endsWith('.png') ||
           fileName.toLowerCase().endsWith('.jpg') ||
           fileName.toLowerCase().endsWith('.jpeg');
  }

  private getMimeTypeFromFileName(fileName: string): string {
    const ext = fileName.toLowerCase().split('.').pop();
    switch (ext) {
      case 'pdf': return 'application/pdf';
      case 'png': return 'image/png';
      case 'jpg':
      case 'jpeg': return 'image/jpeg';
      default: return 'application/octet-stream';
    }
  }

  /**
   * Process files from a Google Drive folder
   */
  async processDriveFolder(folderId: string, sheetId: string, firebaseUid: string, userAuth: any): Promise<{ success: boolean; processedFiles: number; skippedFiles: number; error?: string }> {
    try {
      const files = await this.getDriveFolderFiles(folderId, firebaseUid, userAuth);
      
      console.log(`Found ${files.length} files to process`);

      if (files.length === 0) {
        return { success: true, processedFiles: 0, skippedFiles: 0 };
      }

      // Check which files have already been processed
      const filesToProcess = [];
      let skippedCount = 0;

      for (const file of files) {
        const isProcessed = await this.fileTrackingService.isFileProcessed(firebaseUid, file.id!);
        if (isProcessed) {
          console.log(`Skipping already processed file: ${file.name} (${file.id})`);
          skippedCount++;
        } else {
          filesToProcess.push(file);
        }
      }

      console.log(`Processing ${filesToProcess.length} new files, skipping ${skippedCount} already processed files`);

      if (filesToProcess.length === 0) {
        return { success: true, processedFiles: 0, skippedFiles: skippedCount };
      }

      // Ensure headers in the target sheet with user auth
      await ensureHeaders(sheetId, userAuth);
      await prepareTmp();

      // Process each file with the existing parsing logic
      let processedCount = 0;
      const acc = new Accumulator();

      for (const file of filesToProcess) {
        try {
          console.log(`Processing file: ${file.name} (${file.id})`);
          
          // Mark file as processing
          await this.fileTrackingService.markFileProcessing(
            firebaseUid, 
            file.id!, 
            file.name!, 
            file.webViewLink || '', 
            sheetId
          );

          // Process the file using existing logic
          await this.processSingleFile(file.id!, sheetId, acc, userAuth, file);
          
          // Mark file as completed
          await this.fileTrackingService.markFileCompleted(firebaseUid, file.id!);
          processedCount++;
          
          console.log(`Successfully processed file: ${file.name}`);
        } catch (error: any) {
          console.error(`Error processing file ${file.name}:`, error.message);
          await this.fileTrackingService.markFileFailed(firebaseUid, file.id!, error.message);
        }
      }

      // Write accumulated data to sheet if any
      if (acc.invoices.length > 0 || acc.lines.length > 0) {
        if (acc.invoices.length > 0) {
          await upsertInvoices(acc.invoices, sheetId, userAuth);
          console.log(`✅ ${acc.invoices.length} invoices written to Google Sheets`);
        }
        if (acc.lines.length > 0) {
          await appendLineItems(acc.lines, sheetId, userAuth);
          console.log(`✅ ${acc.lines.length} line items written to Google Sheets`);
        }
      }

      return { 
        success: true, 
        processedFiles: processedCount, 
        skippedFiles: skippedCount 
      };
    } catch (error: any) {
      console.error('Error processing drive folder:', error.message);
      return { 
        success: false, 
        processedFiles: 0, 
        skippedFiles: 0,
        error: error.message 
      };
    }
  }

  /**
   * Process a single file using the existing parsing logic
   */
  private async processSingleFile(fileId: string, sheetId: string, acc: Accumulator, userAuth: any, file?: any): Promise<void> {
    try {
      let filesToProcess: { buffer: Buffer; fileName: string }[] = [];
      
      // Check if this is an extracted file from a zip
      if (file?.isExtracted && file?.filePath) {
        console.log(`Processing extracted file: ${file.name}`);
        const buffer = fs.readFileSync(file.filePath);
        filesToProcess = [{ buffer, fileName: file.name }];
      } else {
        // Download file from Google Drive using user's OAuth client
        const fileData = await downloadDriveFile(fileId, userAuth);
        
        // Check if it's a zip file and extract if needed
        if (isZip(fileData.fileName)) {
          console.log('File is a zip, extracting...');
          const extractedResult = await writeZipAndExtract(fileData.buffer);
          filesToProcess = extractedResult.files.map(f => ({
            buffer: fs.readFileSync(f.filePath),
            fileName: f.fileName
          }));
        } else {
          filesToProcess = [fileData];
        }
      }
      
      console.log(`Files to process: ${filesToProcess.length}`);
      
      // Upload all files to LlamaParse and collect their job IDs
      const jobIds: string[] = [];
      for (const file of filesToProcess) {
        console.log(`Uploading file to LlamaParse: ${file.fileName}`);
        const jobResult = await uploadToLlamaParse(file.buffer, file.fileName);
        jobIds.push(jobResult.id);
        console.log(`LlamaParse job ID: ${jobResult.id}`);
      }
      
      // Poll all jobs with proper retry logic
      for (const id of jobIds) {
        let status: 'SUCCESS'|'PENDING'|'ERROR' = 'PENDING';
        for (let i = 0; i < 60; i++) {
          try {
            status = await pollJob(id);
            console.log(`LlamaParse job ${id} status: ${status}`);
          } catch (e: any) {
            console.error(`Error polling job ${id}:`, e?.message);
            throw e;
          }
          if (status === 'SUCCESS') break;
          if (status === 'ERROR') break;
          await new Promise(r => setTimeout(r, 2000));
        }
      }
      
      // Small delay, then fetch markdown for successful jobs
      await new Promise(r => setTimeout(r, 1500));
      const markdowns: string[] = [];
      for (const id of jobIds) {
        try {
          const md = await getMarkdown(id);
          markdowns.push(md);
          console.log(`Got markdown result for job ${id} (${md.length} chars)`);
        } catch (e: any) {
          const statusCode = e?.response?.status;
          const body = e?.response?.data;
          console.error(`Failed to fetch result for job ${id}:`, e?.message, statusCode, body);
          // skip this one, continue with others
        }
      }
      
      if (markdowns.length === 0) {
        console.log('No markdown results to process');
        return;
      }
      
      // Use batch normalization
      console.log(`Processing ${markdowns.length} markdown results with Groq AI`);
      const results = await normalizeMarkdownBatch(markdowns);
      
      for (const r of results) {
        const inv = this.toStringRecord(r.invoice);
        const lines = r.line_items.map(this.toStringRecord);
        acc.addInvoice(inv);
        acc.addLines(lines);
      }
      
    } catch (error) {
      console.error('Error processing single file:', error);
      throw error;
    }
  }

  private toStringRecord(obj: any): Record<string,string> {
    const out: Record<string,string> = {};
    for (const [k,v] of Object.entries(obj || {})) out[k] = v == null ? '' : String(v);
    return out;
  }
}
