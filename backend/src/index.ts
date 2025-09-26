import { runOnce } from './core/runner';
import { testAuth } from './google/auth';

(async () => {
  try {
    console.log('Testing Google authentication...');
    const authOk = await testAuth();
    if (!authOk) {
      console.error('Authentication failed. Please check your credentials and permissions.');
      process.exitCode = 1;
      return;
    }
    
    console.log('Starting invoice processing...');
    await runOnce();
    console.log('Run complete');
  } catch (e: any) {
    console.error('Run failed:', e?.message || e);
    process.exitCode = 1;
  }
})();
