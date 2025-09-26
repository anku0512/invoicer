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
