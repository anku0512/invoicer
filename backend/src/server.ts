import express from 'express';
import cors from 'cors';
import { EmailChecker } from './cron/emailChecker';

const app = express();
const PORT = process.env.PORT || 3000;

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
