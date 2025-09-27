// Debug script for deployment Google Sheets issues
const { google } = require('googleapis');

async function debugDeployment() {
  console.log('🔍 Debugging deployment Google Sheets configuration...\n');
  
  // Check environment variables
  console.log('📋 Environment Variables Check:');
  console.log('GOOGLE_CLIENT_EMAIL:', process.env.GOOGLE_CLIENT_EMAIL ? '✅ Set' : '❌ Missing');
  console.log('GOOGLE_PRIVATE_KEY:', process.env.GOOGLE_PRIVATE_KEY ? '✅ Set' : '❌ Missing');
  console.log('TARGET_SHEET_ID:', process.env.TARGET_SHEET_ID ? '✅ Set' : '❌ Missing');
  console.log('SOURCE_SHEET_ID:', process.env.SOURCE_SHEET_ID ? '✅ Set' : '❌ Missing');
  
  // Check private key format
  if (process.env.GOOGLE_PRIVATE_KEY) {
    const key = process.env.GOOGLE_PRIVATE_KEY;
    console.log('\n🔑 Private Key Analysis:');
    console.log('Length:', key.length);
    console.log('Starts with -----BEGIN:', key.includes('-----BEGIN'));
    console.log('Ends with -----END:', key.includes('-----END'));
    console.log('Contains \\n:', key.includes('\\n'));
    console.log('Contains actual newlines:', key.includes('\n'));
  }
  
  // Test authentication
  console.log('\n🔐 Testing Authentication:');
  try {
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      throw new Error('Missing credentials');
    }
    
    const jwt = new google.auth.JWT({
      email: process.env.GOOGLE_CLIENT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/spreadsheets',
      ],
    });
    
    await jwt.authorize();
    console.log('✅ Authentication successful');
    
    // Test sheet access
    if (process.env.TARGET_SHEET_ID) {
      console.log('\n📊 Testing Sheet Access:');
      const sheetsApi = google.sheets('v4');
      const sheetInfo = await sheetsApi.spreadsheets.get({ 
        auth: jwt, 
        spreadsheetId: process.env.TARGET_SHEET_ID 
      });
      console.log('✅ Sheet access successful');
      console.log('Sheet title:', sheetInfo.data.properties?.title);
      console.log('Available tabs:', sheetInfo.data.sheets?.map(s => s.properties?.title));
    }
    
  } catch (error) {
    console.log('❌ Authentication failed:', error.message);
    
    if (error.message.includes('invalid_grant')) {
      console.log('💡 Fix: Check GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY');
    }
    if (error.message.includes('access_denied')) {
      console.log('💡 Fix: Enable Google Sheets API and check service account permissions');
    }
    if (error.message.includes('notFound')) {
      console.log('💡 Fix: Check TARGET_SHEET_ID and ensure service account has access');
    }
  }
  
  console.log('\n🏁 Debug complete');
}

debugDeployment().catch(console.error);
