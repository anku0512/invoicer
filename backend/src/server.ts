import express from 'express';
import cors from 'cors';
import { EmailChecker } from './cron/emailChecker';
import { downloadDriveFile } from './google/drive';
import { prepareTmp, isZip, writeZipAndExtract } from './ingest/fileHandler';
import { uploadToLlamaParse, pollJob, getMarkdown } from './ingest/llamaparse';
import { normalizeMarkdown } from './ai/normalize';
import { ensureHeaders, upsertInvoices, appendLineItems } from './google/sheets';
import { Accumulator } from './core/accumulator';
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
    
    // For now, create a simple test PDF buffer for LlamaParse testing
    console.log('Creating test PDF for LlamaParse testing...');
    
    // Create a minimal PDF buffer (PDF header + basic structure)
    const pdfHeader = '%PDF-1.4\n';
    const pdfContent = pdfHeader + '1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n/Contents 4 0 R\n>>\nendobj\n4 0 obj\n<<\n/Length 44\n>>\nstream\nBT\n/F1 12 Tf\n100 700 Td\n(Test Invoice) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000204 00000 n \ntrailer\n<<\n/Size 5\n/Root 1 0 R\n>>\nstartxref\n297\n%%EOF';
    
    const testFileData = {
      buffer: Buffer.from(pdfContent),
      fileName: 'test-invoice.pdf'
    };
    console.log(`Created test PDF: ${testFileData.fileName} (${testFileData.buffer.length} bytes)`);
    
    // Process the test file
    let filesToProcess: { buffer: Buffer; fileName: string }[] = [testFileData];
    
    console.log(`Files to process: ${filesToProcess.length}`);
    
    // Process each file with LlamaParse
    const acc = new Accumulator();
    
    for (const file of filesToProcess) {
      console.log(`Processing file: ${file.fileName}`);
      
      // Upload to LlamaParse
      const jobResult = await uploadToLlamaParse(file.buffer, file.fileName);
      console.log(`LlamaParse job ID: ${jobResult.id}`);
      
      // Poll for completion
      const result = await pollJob(jobResult.id);
      console.log(`LlamaParse completed: ${result}`);
      
      if (result === 'SUCCESS') {
        // Get the markdown result
        const markdown = await getMarkdown(jobResult.id);
        console.log(`Got markdown result (${markdown.length} chars)`);
        
        // Normalize the markdown
        const normalized = await normalizeMarkdown(markdown);
        console.log(`Normalized data:`, normalized);
        
        // Add to accumulator
        if (normalized && normalized.invoice) {
          acc.addInvoice(normalized.invoice);
          if (normalized.line_items && normalized.line_items.length > 0) {
            acc.addLines(normalized.line_items);
          }
        }
      } else {
        console.log(`LlamaParse job failed: ${result}`);
      }
    }
    
    // Ensure headers exist in the sheet
    await ensureHeaders();
    
    // Process all accumulated data
    const allInvoices = acc.invoices;
    console.log(`Total invoices to process: ${allInvoices.length}`);
    
    if (allInvoices.length > 0) {
      // Upsert invoices to the sheet
      await upsertInvoices(allInvoices);
      console.log('Invoices upserted to sheet');
      
      // Append line items
      await appendLineItems(allInvoices);
      console.log('Line items appended to sheet');
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

// Process single Drive URL endpoint
app.post('/api/process-url', async (req, res) => {
  try {
    const { driveUrl, sheetId } = req.body;
    
    if (!driveUrl || !sheetId) {
      return res.status(400).json({ 
        success: false, 
        error: 'driveUrl and sheetId are required' 
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
    
    // Set the user's sheet ID in environment for processing
    const originalTargetSheetId = process.env.TARGET_SHEET_ID;
    const originalSourceSheetId = process.env.SOURCE_SHEET_ID;
    process.env.TARGET_SHEET_ID = sheetId;
    process.env.SOURCE_SHEET_ID = sheetId;
    
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
