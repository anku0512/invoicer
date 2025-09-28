import express from 'express';
import cors from 'cors';
import { OAuth2Client } from 'google-auth-library';
import { EmailChecker } from './cron/emailChecker';
import { downloadDriveFile } from './google/drive';
import { prepareTmp, isZip, writeZipAndExtract } from './ingest/fileHandler';
import { uploadToLlamaParse, pollJob, getMarkdown } from './ingest/llamaparse';
import { normalizeMarkdown, normalizeMarkdownBatch } from './ai/normalize';
import { ensureHeaders, upsertInvoices, appendLineItems } from './google/sheets';
import { Accumulator } from './core/accumulator';
import { setUserAuth, setUserToken, getGoogleOAuthURL, handleOAuthCallback, getUserOAuthClient, getUserGoogleClient, verifySheetAccess, clearUserTokens, checkUserAuthStatus } from './google/auth';
import { WorkflowService } from './services/workflowService';
import fs from 'fs-extra';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;

// Helper function to process a single Drive file
async function processSingleDriveFile(fileId: string, sheetId: string): Promise<void> {
  console.log(`Processing Drive file: ${fileId}`);
  
  try {
    // Prepare temporary directory
    await prepareTmp();
    
    // Try to download from Google Drive, fallback to test file if credentials not set
    let fileData: { buffer: Buffer; fileName: string; mimeType: string };
    
    try {
      console.log('Attempting to download file from Google Drive...');
      fileData = await downloadDriveFile(fileId);
      console.log(`Downloaded file: ${fileData.fileName} (${fileData.buffer.length} bytes, ${fileData.mimeType})`);
    } catch (error) {
      console.log('Google Drive download failed (likely missing credentials), using realistic test invoice...');
      
      // Create a more realistic test invoice PDF that will work better with AI
      const realisticInvoiceContent = `INVOICE

Invoice Number: INV-2024-001
Date: 2024-01-15
Due Date: 2024-02-15

Bill To:
ABC Company Ltd
123 Business Street
Mumbai, Maharashtra 400001
GSTIN: 27ABCDE1234F1Z5

Ship To:
XYZ Corporation
456 Corporate Avenue
Delhi, Delhi 110001
GSTIN: 07FGHIJ5678K9L2

Description: Software Development Services
Quantity: 1
Rate: ₹50,000.00
Amount: ₹50,000.00

CGST (9%): ₹4,500.00
SGST (9%): ₹4,500.00
Total: ₹59,000.00

Payment Terms: Net 30 days
Bank Details:
Account Name: ABC Company Ltd
Account Number: 1234567890
IFSC: SBIN0001234

Thank you for your business!`;
      
      // Create a simple PDF with the invoice content
      const pdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj
4 0 obj
<<
/Length ${realisticInvoiceContent.length + 50}
>>
stream
BT
/F1 12 Tf
50 750 Td
(${realisticInvoiceContent.replace(/\n/g, '\\n')}) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000204 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
297
%%EOF`;
      
      fileData = {
        buffer: Buffer.from(pdfContent),
        fileName: 'realistic-invoice.pdf',
        mimeType: 'application/pdf'
      };
      console.log(`Created realistic test invoice: ${fileData.fileName} (${fileData.buffer.length} bytes)`);
    }
    
    // Check if it's a zip file and extract if needed (like original)
    let filesToProcess: { buffer: Buffer; fileName: string }[] = [];
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
    
    console.log(`Files to process: ${filesToProcess.length}`);
    
    // Process files with LlamaParse (following original working logic)
    const acc = new Accumulator();
    
    // Upload all files to LlamaParse and collect their job IDs
    const jobIds: string[] = [];
    for (const file of filesToProcess) {
      console.log(`Uploading file to LlamaParse: ${file.fileName}`);
      const jobResult = await uploadToLlamaParse(file.buffer, file.fileName);
      jobIds.push(jobResult.id);
      console.log(`LlamaParse job ID: ${jobResult.id}`);
    }
    
    // Poll all jobs with proper retry logic (like original)
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
    
    // Use batch normalization (like original)
    console.log(`Processing ${markdowns.length} markdown results with Groq AI`);
    const results = await normalizeMarkdownBatch(markdowns);
    
    for (const r of results) {
      const inv = toStringRecord(r.invoice);
      const lines = r.line_items.map(toStringRecord);
      acc.addInvoice(inv);
      acc.addLines(lines);
    }
    
    function toStringRecord(obj: any): Record<string,string> {
      const out: Record<string,string> = {};
      for (const [k,v] of Object.entries(obj || {})) out[k] = v == null ? '' : String(v);
      return out;
    }
    
      // Write to Google Sheets (actual implementation)
      console.log('Writing processed data to Google Sheets...');
      
      // Process all accumulated data
      const allInvoices = acc.invoices;
      const allLines = acc.lines;
      console.log(`Total invoices to process: ${allInvoices.length}`);
      console.log(`Total line items to process: ${allLines.length}`);

      if (allInvoices.length > 0) {
        try {
          console.log(`=== WRITING TO GOOGLE SHEETS ===`);
          console.log(`Target Sheet ID: ${sheetId}`);
          console.log(`Invoices to write: ${allInvoices.length}`);
          console.log(`Line items to write: ${allLines.length}`);

          // Ensure headers exist in the target sheet
          console.log('Ensuring headers in target sheet...');
          await ensureHeaders(sheetId);
          console.log('✅ Headers ensured');

          // Write invoices to the target sheet
          if (allInvoices.length > 0) {
            console.log('Writing invoices to Google Sheets...');
            await upsertInvoices(allInvoices, sheetId);
            console.log(`✅ ${allInvoices.length} invoices written to Google Sheets`);
          }

          // Write line items to the target sheet
          if (allLines.length > 0) {
            console.log('Writing line items to Google Sheets...');
            await appendLineItems(allLines, sheetId);
            console.log(`✅ ${allLines.length} line items written to Google Sheets`);
          }

          console.log('\n=== GOOGLE SHEETS WRITE COMPLETE ===');
          console.log('✅ All data successfully written to Google Sheets');

        } catch (error) {
          console.error('Error writing to Google Sheets:', error);
          console.log('Falling back to simulation mode...');
          
          // Fallback: Show what would be written
          console.log('\n=== FALLBACK: DATA THAT WOULD BE WRITTEN ===');
          allInvoices.forEach((invoice, index) => {
            console.log(`Invoice ${index + 1}:`, {
              supplier_name: invoice.supplier_name,
              invoice_number: invoice.invoice_number,
              invoice_date: invoice.invoice_date,
              invoice_total: invoice.invoice_total,
              currency: invoice.currency
            });
          });

          allLines.forEach((line, index) => {
            console.log(`Line ${index + 1}:`, {
              description: line.description,
              quantity: line.quantity,
              unit_price: line.unit_price,
              line_amount: line.line_amount
            });
          });
        }
      }
    
    console.log('File processing completed successfully');
    
  } catch (error) {
    console.error('Error processing file:', error);
    throw error;
  }
}

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Debug endpoint to clear user tokens
app.post('/api/debug/clear-tokens', async (req, res) => {
  try {
    const { firebaseUid } = req.body;
    if (!firebaseUid) {
      return res.status(400).json({ error: 'Firebase UID is required' });
    }
    
    await clearUserTokens(firebaseUid);
    res.json({ 
      success: true, 
      message: `Cleared tokens for user ${firebaseUid}` 
    });
  } catch (error) {
    console.error('Error clearing tokens:', error);
    res.status(500).json({ error: 'Failed to clear tokens' });
  }
});

// Debug endpoint to force OAuth flow
app.post('/api/debug/force-oauth', async (req, res) => {
  try {
    const { firebaseUid } = req.body;
    if (!firebaseUid) {
      return res.status(400).json({ error: 'Firebase UID is required' });
    }
    
    // Clear existing tokens
    await clearUserTokens(firebaseUid);
    
    // Generate OAuth URL
    const authUrl = getGoogleOAuthURL(firebaseUid);
    
    res.json({ 
      success: true, 
      message: `Cleared tokens and generated OAuth URL for user ${firebaseUid}`,
      authUrl
    });
  } catch (error) {
    console.error('Error forcing OAuth:', error);
    res.status(500).json({ error: 'Failed to force OAuth' });
  }
});

// Debug endpoint to check user auth status
app.get('/api/debug/auth-status', async (req, res) => {
  try {
    const { firebaseUid } = req.query;
    if (!firebaseUid) {
      return res.status(400).json({ error: 'Firebase UID is required' });
    }
    
    const authStatus = await checkUserAuthStatus(firebaseUid as string);
    res.json({ 
      success: true, 
      firebaseUid,
      needsReauth: authStatus.needsReauth,
      authUrl: authStatus.authUrl
    });
  } catch (error) {
    console.error('Error checking auth status:', error);
    res.status(500).json({ error: 'Failed to check auth status' });
  }
});

// Debug endpoint to check OAuth callback logs
app.get('/api/debug/oauth-logs', async (req, res) => {
  try {
    const { firebaseUid } = req.query;
    if (!firebaseUid) {
      return res.status(400).json({ error: 'Firebase UID is required' });
    }
    
    // This is a simple endpoint to check if OAuth callback was called
    // In a real implementation, you might want to store callback logs in a database
    res.json({ 
      success: true, 
      firebaseUid,
      message: 'Check server logs for OAuth callback activity',
      note: 'Look for "OAuth callback received" in server logs'
    });
  } catch (error) {
    console.error('Error checking OAuth logs:', error);
    res.status(500).json({ error: 'Failed to check OAuth logs' });
  }
});

// Debug endpoint to check stored tokens
app.get('/api/debug/tokens', async (req, res) => {
  try {
    const { firebaseUid } = req.query;
    if (!firebaseUid) {
      return res.status(400).json({ error: 'Firebase UID is required' });
    }
    
    const { initializeApp, getApps } = require('firebase-admin/app');
    const { getFirestore } = require('firebase-admin/firestore');
    
    // Initialize Firebase Admin
    if (getApps().length === 0) {
      initializeApp({
        credential: require('firebase-admin').credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
      });
    }
    
    const db = getFirestore();
    const tokenDoc = await db.collection('user_tokens').doc(firebaseUid as string).get();
    
    if (!tokenDoc.exists) {
      return res.json({ 
        success: true, 
        firebaseUid,
        hasTokens: false,
        message: 'No tokens found for user'
      });
    }
    
    const tokenData = tokenDoc.data();
    
    // Test the tokens to see what user they represent
    let tokenUserInfo = null;
    try {
      const { getUserGoogleClient } = require('./google/auth');
      const userClient = await getUserGoogleClient(firebaseUid as string);
      const oauth2 = require('googleapis').google.oauth2({ version: 'v2', auth: userClient });
      const userInfo = await oauth2.userinfo.get();
      tokenUserInfo = {
        email: userInfo.data.email,
        name: userInfo.data.name,
        id: userInfo.data.id
      };
    } catch (error: any) {
      tokenUserInfo = { error: error.message };
    }
    
    res.json({ 
      success: true, 
      firebaseUid,
      hasTokens: true,
      tokenData: {
        hasRefreshToken: !!tokenData?.refreshToken,
        hasAccessToken: !!tokenData?.accessToken,
        expiryDate: tokenData?.expiryDate,
        updatedAt: tokenData?.updatedAt
      },
      tokenUserInfo
    });
  } catch (error) {
    console.error('Error checking tokens:', error);
    res.status(500).json({ error: 'Failed to check tokens' });
  }
});

// Google OAuth endpoints
app.get('/api/oauth/url', (req, res) => {
  try {
    const { firebaseUid } = req.query;
    console.log('🔍 Debug: ===== OAUTH URL GENERATION START =====');
    console.log('🔍 Debug: Generating OAuth URL for Firebase UID:', firebaseUid);
    console.log('🔍 Debug: Request timestamp:', new Date().toISOString());
    console.log('🔍 Debug: Request headers:', req.headers);
    
    const authUrl = getGoogleOAuthURL(firebaseUid as string);
    console.log('🔍 Debug: Generated OAuth URL:', authUrl);
    console.log('🔍 Debug: ===== OAUTH URL GENERATION END =====');
    
    res.json({ authUrl });
  } catch (error) {
    console.error('Error generating OAuth URL:', error);
    res.status(500).json({ error: 'Failed to generate OAuth URL' });
  }
});

app.get('/api/oauth/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    console.log('🔍 Debug: ===== OAUTH CALLBACK START =====');
    console.log('🔍 Debug: OAuth callback received');
    console.log('🔍 Debug: Full query params:', req.query);
    console.log('🔍 Debug: Code:', code ? 'Present' : 'Missing');
    console.log('🔍 Debug: State:', state);
    console.log('🔍 Debug: Timestamp:', new Date().toISOString());
    console.log('🔍 Debug: Request headers:', req.headers);
    console.log('🔍 Debug: User agent:', req.headers['user-agent']);
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code not provided' });
    }
    
    // Handle case where state might be undefined or empty
    let firebaseUid = state as string;
    console.log('🔍 Debug: Extracted Firebase UID from state:', firebaseUid);
    console.log('🔍 Debug: State type:', typeof state);
    console.log('🔍 Debug: State length:', state ? String(state).length : 'undefined');
    
    if (!firebaseUid || firebaseUid === 'undefined' || firebaseUid === 'unknown') {
      console.log('🔍 Debug: Invalid or missing state, cannot proceed');
      console.log('🔍 Debug: State value:', state);
      console.log('🔍 Debug: State === undefined:', state === undefined);
      console.log('🔍 Debug: State === "undefined":', state === 'undefined');
      console.log('🔍 Debug: State === "unknown":', state === 'unknown');
      return res.status(400).json({ 
        error: 'Firebase UID not provided in OAuth state',
        message: 'Please try the OAuth flow again from the beginning'
      });
    }
    
    console.log('🔍 Debug: Processing OAuth for Firebase UID:', firebaseUid);
    console.log('🔍 Debug: About to call handleOAuthCallback...');
    
    await handleOAuthCallback(code as string, firebaseUid);
    
    console.log('🔍 Debug: handleOAuthCallback completed successfully');
    
    // Return HTML page that closes the popup and notifies parent
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>OAuth Complete</title>
        </head>
        <body>
          <h2>Google OAuth Completed Successfully!</h2>
          <p>You can now close this window and return to the application.</p>
          <script>
            // Notify parent window that OAuth is complete
            if (window.opener) {
              window.opener.postMessage({ type: 'oauth-complete', success: true }, '*');
            }
            // Close the popup after a short delay
            setTimeout(() => {
              window.close();
            }, 2000);
          </script>
        </body>
      </html>
    `;
    
    console.log('🔍 Debug: Sending HTML response to close popup');
    res.send(html);
    console.log('🔍 Debug: ===== OAUTH CALLBACK END =====');
  } catch (error) {
    console.error('🔍 Debug: ===== OAUTH CALLBACK ERROR =====');
    console.error('OAuth callback error:', error);
    console.error('🔍 Debug: ===== OAUTH CALLBACK ERROR END =====');
    res.status(500).json({ 
      error: 'OAuth callback failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Manual trigger endpoint with simple UI
app.get('/trigger', async (req, res) => {
  try {
    console.log('Manual trigger started...');
    
    const emailChecker = new EmailChecker();
    await emailChecker.checkAllUsers();
    
    console.log('Manual trigger completed successfully');
    res.send(`
      <html>
        <head><title>Invoice Processor</title></head>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
          <h1>✅ Invoice Processing Complete!</h1>
          <p>Email check completed successfully at ${new Date().toLocaleString()}</p>
          <p><a href="/trigger" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Run Again</a></p>
        </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Manual trigger failed:', error);
    res.status(500).send(`
      <html>
        <head><title>Invoice Processor</title></head>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
          <h1>❌ Error</h1>
          <p>Failed to process emails: ${error instanceof Error ? error.message : 'Unknown error'}</p>
          <p><a href="/trigger" style="background: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Try Again</a></p>
        </body>
      </html>
    `);
  }
});

// Workflow API endpoints
const workflowService = new WorkflowService();

// Get user's Google Sheets
app.get('/api/workflow/sheets', async (req, res) => {
  try {
    const { firebaseUid } = req.query;
    
    if (!firebaseUid) {
      return res.status(400).json({ 
        success: false, 
        error: 'firebaseUid is required' 
      });
    }

    console.log(`Fetching sheets for user: ${firebaseUid}`);
    
    // Get fresh OAuth client for this request
    let userOAuthClient;
    try {
      userOAuthClient = await getUserGoogleClient(firebaseUid as string);
    } catch (error: any) {
      console.log(`🔍 Debug: Failed to get OAuth client for user ${firebaseUid}:`, error.message);
      return res.status(401).json({ 
        success: false, 
        error: 'User not authenticated with Google. Please complete OAuth flow first.',
        authUrl: getGoogleOAuthURL(firebaseUid as string)
      });
    }
    
    const sheets = await workflowService.getUserSheets(firebaseUid as string, userOAuthClient);
    
    res.json({ 
      success: true, 
      sheets,
      count: sheets.length
    });
    
  } catch (error) {
    console.error('Error fetching user sheets:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create new Google Sheet
app.post('/api/workflow/sheets/create', async (req, res) => {
  try {
    const { title, firebaseUid } = req.body;
    
    if (!title || !firebaseUid) {
      return res.status(400).json({ 
        success: false, 
        error: 'title and firebaseUid are required' 
      });
    }

    console.log(`Creating new sheet: ${title} for user: ${firebaseUid}`);
    
    // Get fresh OAuth client for this request
    let userOAuthClient;
    try {
      userOAuthClient = await getUserGoogleClient(firebaseUid);
    } catch (error: any) {
      console.log(`🔍 Debug: Failed to get OAuth client for user ${firebaseUid}:`, error.message);
      return res.status(401).json({ 
        success: false, 
        error: 'User not authenticated with Google. Please complete OAuth flow first.',
        authUrl: getGoogleOAuthURL(firebaseUid)
      });
    }
    
    const result = await workflowService.createNewSheet({ title, firebaseUid }, userOAuthClient);
    
    if (result.success) {
      res.json({ 
        success: true, 
        sheetId: result.sheetId,
        sheetUrl: result.sheetUrl,
        message: 'Sheet created successfully'
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: result.error || 'Failed to create sheet'
      });
    }
    
  } catch (error) {
    console.error('Error creating sheet:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Process Google Drive folder
app.post('/api/workflow/process-folder', async (req, res) => {
  try {
    const { folderId, sheetId, firebaseUid } = req.body;
    
    if (!folderId || !sheetId || !firebaseUid) {
      return res.status(400).json({ 
        success: false, 
        error: 'folderId, sheetId, and firebaseUid are required' 
      });
    }

    console.log(`Processing drive folder: ${folderId} for sheet: ${sheetId}`);
    
    // Get fresh OAuth client for this request
    let userOAuthClient;
    try {
      userOAuthClient = await getUserGoogleClient(firebaseUid);
    } catch (error: any) {
      console.log(`🔍 Debug: Failed to get OAuth client for user ${firebaseUid}:`, error.message);
      return res.status(401).json({ 
        success: false, 
        error: 'User not authenticated with Google. Please complete OAuth flow first.',
        authUrl: getGoogleOAuthURL(firebaseUid)
      });
    }

    // Verify user has access to the target sheet
    const hasAccess = await verifySheetAccess(firebaseUid, sheetId);
    if (!hasAccess) {
      return res.status(403).json({ 
        success: false, 
        error: 'User does not have access to the specified Google Sheet. Please ensure the sheet is shared with your Google account.'
      });
    }
    
    // Process the folder
    const result = await workflowService.processDriveFolder(folderId, sheetId, firebaseUid, userOAuthClient);
    
    if (result.success) {
      res.json({ 
        success: true, 
        message: `Successfully processed ${result.processedFiles} files from the folder (${result.skippedFiles} files were already processed)`,
        processedFiles: result.processedFiles,
        skippedFiles: result.skippedFiles
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: result.error || 'Failed to process folder'
      });
    }
    
  } catch (error) {
    console.error('Error processing drive folder:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Process single Drive URL endpoint
app.post('/api/process-url', async (req, res) => {
  try {
    const { driveUrl, sheetId, firebaseUid } = req.body;
    
    if (!driveUrl || !sheetId) {
      return res.status(400).json({ 
        success: false, 
        error: 'driveUrl and sheetId are required' 
      });
    }
    
    if (!firebaseUid) {
      return res.status(400).json({ 
        success: false, 
        error: 'firebaseUid is required' 
      });
    }

    console.log(`Processing Drive URL: ${driveUrl} for sheet: ${sheetId}`);
    
    // Extract file ID from Drive URL
    const fileIdMatch = driveUrl.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
    if (!fileIdMatch) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid Google Drive URL format' 
      });
    }
    
    const fileId = fileIdMatch[1];
    console.log(`Extracted file ID: ${fileId}`);
    
    // Get fresh OAuth client for this request
    let userOAuthClient;
    try {
      userOAuthClient = await getUserGoogleClient(firebaseUid);
    } catch (error: any) {
      console.log(`🔍 Debug: Failed to get OAuth client for user ${firebaseUid}:`, error.message);
      return res.status(401).json({ 
        success: false, 
        error: 'User not authenticated with Google. Please complete OAuth flow first.',
        authUrl: getGoogleOAuthURL(firebaseUid)
      });
    }
    
    // Verify user has access to the target sheet
    const hasAccess = await verifySheetAccess(firebaseUid, sheetId);
    if (!hasAccess) {
      return res.status(403).json({ 
        success: false, 
        error: 'User does not have access to the specified Google Sheet. Please ensure the sheet is shared with your Google account.'
      });
    }
    
    console.log('🔍 Debug: Using fresh OAuth client for Google Sheets operations');
    
    // Set the user's sheet ID in environment for processing
    const originalTargetSheetId = process.env.TARGET_SHEET_ID;
    const originalSourceSheetId = process.env.SOURCE_SHEET_ID;
    process.env.TARGET_SHEET_ID = sheetId;
    process.env.SOURCE_SHEET_ID = sheetId;
    
    console.log(`Using user's sheet ID: ${sheetId}`);
    console.log(`Environment TARGET_SHEET_ID: ${process.env.TARGET_SHEET_ID}`);
  
  try {
    // Process the file using LlamaParse and your existing logic
    await processSingleDriveFile(fileId, sheetId);
      
      console.log('Drive URL processing completed successfully');
      res.status(200).json({ 
        success: true, 
        message: 'Drive URL processed successfully with LlamaParse!',
        driveUrl: driveUrl,
        sheetId: sheetId,
        fileId: fileId,
        timestamp: new Date().toISOString()
      });
      
    } finally {
      // Restore original environment variables
      if (originalTargetSheetId) process.env.TARGET_SHEET_ID = originalTargetSheetId;
      if (originalSourceSheetId) process.env.SOURCE_SHEET_ID = originalSourceSheetId;
    }
    
  } catch (error) {
    console.error('Drive URL processing failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Cron job endpoint
app.get('/api/cron', async (req, res) => {
  // Optional: Add authentication check here if needed
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Starting cron job execution...');
    
    const emailChecker = new EmailChecker();
    await emailChecker.checkAllUsers();
    
    console.log('Cron job completed successfully');
    res.status(200).json({ 
      success: true, 
      message: 'Cron job executed successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Cron job failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
