import { google } from 'googleapis';
import { env } from '../config/env';
import { OAuth2Client } from 'google-auth-library';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Helper function to properly format private key for different environments
function formatPrivateKey(privateKey: string): string {
  // Remove any extra whitespace
  let formatted = privateKey.trim();
  
  // Replace escaped newlines with actual newlines
  formatted = formatted.replace(/\\n/g, '\n');
  
  // Ensure proper line breaks in the key
  if (!formatted.includes('\n')) {
    // If no newlines, try to add them at appropriate places
    formatted = formatted.replace(/(-----BEGIN PRIVATE KEY-----)/, '$1\n');
    formatted = formatted.replace(/(-----END PRIVATE KEY-----)/, '\n$1');
    // Add newlines every 64 characters in the key body
    const keyBody = formatted.match(/-----BEGIN PRIVATE KEY-----\n?(.*?)\n?-----END PRIVATE KEY-----/s);
    if (keyBody) {
      const keyContent = keyBody[1].replace(/\s/g, ''); // Remove all whitespace
      const lines = keyContent.match(/.{1,64}/g) || [];
      const formattedKeyBody = lines.join('\n');
      formatted = `-----BEGIN PRIVATE KEY-----\n${formattedKeyBody}\n-----END PRIVATE KEY-----`;
    }
  }
  
  return formatted;
}

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

// Initialize Firebase Admin if not already initialized
function initializeFirebaseAdmin() {
  if (getApps().length === 0) {
    initializeApp({
      credential: require('firebase-admin').credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
      }),
    });
  }
}

// Google OAuth2 configuration
// Use localhost for local development, production URL for deployment
const getRedirectUri = () => {
  if (process.env.NODE_ENV === 'development' || !process.env.BACKEND_URL) {
    return 'http://localhost:3000/api/oauth/callback';
  }
  return `${process.env.BACKEND_URL}/api/oauth/callback`;
};

const oauth2Client = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  getRedirectUri()
);

// Store the current user's auth client
let currentUserAuth: OAuth2Client | null = null;
let currentUserToken: string | null = null;

export function setUserAuth(auth: OAuth2Client) {
  currentUserAuth = auth;
}

export function setUserToken(token: string) {
  currentUserToken = token;
  console.log('🔍 Debug: Set user token for direct API calls');
}

// Generate Google OAuth URL
export function getGoogleOAuthURL(firebaseUid?: string): string {
  console.log('🔍 Debug: getGoogleOAuthURL called with firebaseUid:', firebaseUid);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: firebaseUid || 'unknown',
  });
  console.log('🔍 Debug: Generated auth URL with state:', firebaseUid || 'unknown');
  return authUrl;
}

// Handle OAuth callback and store refresh token
export async function handleOAuthCallback(code: string, firebaseUid: string): Promise<void> {
  try {
    // Create a fresh OAuth2Client for this specific user's OAuth flow
    const userOAuth2Client = new OAuth2Client(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      getRedirectUri()
    );
    
    console.log(`🔍 Debug: Created fresh OAuth2Client for user ${firebaseUid}`);
    const { tokens } = await userOAuth2Client.getToken(code);
    
    if (!tokens.refresh_token) {
      throw new Error('No refresh token received from Google OAuth');
    }
    
    console.log(`🔍 Debug: Received tokens for user ${firebaseUid}:`, {
      hasRefreshToken: !!tokens.refresh_token,
      hasAccessToken: !!tokens.access_token,
      expiryDate: tokens.expiry_date
    });
    
    // Test the tokens to see what user they represent
    try {
      const testOAuth2Client = new OAuth2Client(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET,
        getRedirectUri()
      );
      testOAuth2Client.setCredentials({
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        expiry_date: tokens.expiry_date,
      });
      
      const oauth2 = google.oauth2({ version: 'v2', auth: testOAuth2Client });
      const userInfo = await oauth2.userinfo.get();
      console.log(`🔍 Debug: OAuth callback tokens represent user:`, {
        email: userInfo.data.email,
        name: userInfo.data.name,
        id: userInfo.data.id
      });
    } catch (error: any) {
      console.log(`🔍 Debug: Could not get user info from OAuth callback tokens:`, error.message);
    }
    
    // Initialize Firebase Admin
    initializeFirebaseAdmin();
    const db = getFirestore();
    
    // Store refresh token in Firestore
    await db.collection('user_tokens').doc(firebaseUid).set({
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiryDate: tokens.expiry_date,
      updatedAt: new Date(),
    });
    
    console.log(`🔍 Debug: Stored refresh token for user ${firebaseUid}`);
  } catch (error) {
    console.error('🔍 Debug: Failed to handle OAuth callback:', error);
    throw error;
  }
}

// Get OAuth2Client for a specific user - per-request approach
export async function getUserGoogleClient(firebaseUid: string): Promise<OAuth2Client> {
  console.log(`🔍 Debug: Creating fresh OAuth2Client for user ${firebaseUid}`);
  
  // Initialize Firebase Admin
  initializeFirebaseAdmin();
  const db = getFirestore();
  
  // Get user's tokens from Firestore
  const tokenDoc = await db.collection('user_tokens').doc(firebaseUid).get();
  
  if (!tokenDoc.exists) {
    console.log(`🔍 Debug: No tokens found for user ${firebaseUid}`);
    throw new Error('No Google OAuth connected for this user');
  }
  
  const tokenData = tokenDoc.data();
  console.log(`🔍 Debug: Retrieved token data for user ${firebaseUid}:`, {
    hasRefreshToken: !!tokenData?.refreshToken,
    hasAccessToken: !!tokenData?.accessToken,
    expiryDate: tokenData?.expiryDate,
    updatedAt: tokenData?.updatedAt
  });
  
  if (!tokenData?.refreshToken) {
    console.log(`🔍 Debug: No refresh token found for user ${firebaseUid}`);
    throw new Error('No refresh token found for this user');
  }
  
  // Create fresh OAuth2Client for this request
  const client = new OAuth2Client(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  );
  
  // Set credentials from database
  client.setCredentials({
    refresh_token: tokenData.refreshToken,
    access_token: tokenData.accessToken,
    expiry_date: tokenData.expiryDate,
  });
  
  // Force token refresh to ensure we have valid credentials
  try {
    console.log(`🔍 Debug: Refreshing tokens for user ${firebaseUid}`);
    const { credentials } = await client.refreshAccessToken();
    console.log(`🔍 Debug: Token refresh successful for user ${firebaseUid}`);
    
    // Update stored tokens with refreshed ones
    if (credentials.access_token) {
      await db.collection('user_tokens').doc(firebaseUid).update({
        accessToken: credentials.access_token,
        expiryDate: credentials.expiry_date,
        updatedAt: new Date(),
      });
      console.log(`🔍 Debug: Updated stored tokens for user ${firebaseUid}`);
    }
  } catch (refreshError: any) {
    console.log(`🔍 Debug: Token refresh failed for user ${firebaseUid}:`, refreshError.message);
    // If refresh fails, the tokens might be invalid - we'll need to re-authenticate
    if (refreshError.message.includes('invalid_grant') || refreshError.message.includes('invalid_request')) {
      console.log(`🔍 Debug: Tokens are invalid for user ${firebaseUid}, need to re-authenticate`);
      throw new Error('Invalid OAuth tokens - user needs to re-authenticate');
    }
    throw refreshError;
  }
  
  // Test the OAuth client to see what user it represents
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const userInfo = await oauth2.userinfo.get();
    console.log(`🔍 Debug: Fresh OAuth2Client for user ${firebaseUid} represents:`, {
      email: userInfo.data.email,
      name: userInfo.data.name,
      id: userInfo.data.id
    });
  } catch (error: any) {
    console.log(`🔍 Debug: Could not get user info for OAuth2Client:`, error.message);
    // If we can't get user info, the tokens are likely invalid
    if (error.message.includes('authentication credential') || error.message.includes('invalid_grant')) {
      console.log(`🔍 Debug: Tokens appear to be invalid for user ${firebaseUid}`);
      throw new Error('Invalid OAuth tokens - user needs to re-authenticate');
    }
    throw error;
  }
  
  console.log(`🔍 Debug: Created fresh OAuth2Client for user ${firebaseUid}`);
  return client;
}

// Legacy function for backward compatibility - now throws error to force migration
export async function getUserOAuthClient(firebaseUid: string): Promise<OAuth2Client | null> {
  console.log(`🔍 Debug: WARNING: Using deprecated getUserOAuthClient for user ${firebaseUid}`);
  try {
    return await getUserGoogleClient(firebaseUid);
  } catch (error) {
    console.log(`🔍 Debug: getUserOAuthClient failed for user ${firebaseUid}:`, error);
    return null;
  }
}

// Verify user has access to a specific sheet
export async function verifySheetAccess(firebaseUid: string, sheetId: string): Promise<boolean> {
  try {
    const userOAuthClient = await getUserOAuthClient(firebaseUid);
    if (!userOAuthClient) {
      return false;
    }
    
    const sheets = google.sheets({ version: 'v4', auth: userOAuthClient });
    
    // Try to get sheet info to verify access
    await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    
    console.log(`🔍 Debug: User ${firebaseUid} has access to sheet ${sheetId}`);
    return true;
  } catch (error) {
    console.error(`🔍 Debug: User ${firebaseUid} does not have access to sheet ${sheetId}:`, error);
    return false;
  }
}

export function getGoogleAuth() {
  // Always require user authentication for Google Sheets operations
  if (currentUserAuth) {
    console.log('🔍 Debug: Using user OAuth authentication for Google Sheets');
    return currentUserAuth;
  }
  
  console.log('🔍 Debug: No user auth available - user must authenticate with Google OAuth');
  throw new Error('User authentication required. Please complete Google OAuth flow first.');
}

// New function for service account auth (only for specific operations)
export function getServiceAccountAuth() {
  console.log('🔍 Debug: Using service account authentication');
  
  // Check if service account credentials are available
  if (!env.GOOGLE_CLIENT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
    throw new Error('Google service account credentials not configured. Please set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY environment variables.');
  }
  
  try {
    // Format the private key properly for the deployment environment
    const formattedPrivateKey = formatPrivateKey(env.GOOGLE_PRIVATE_KEY);
    
    console.log('🔍 Debug: Private key formatted successfully');
    
    const jwt = new google.auth.JWT({
      email: env.GOOGLE_CLIENT_EMAIL,
      key: formattedPrivateKey,
      scopes: SCOPES,
    });
    return jwt;
  } catch (error: any) {
    console.error('Failed to create Google auth:', error);
    if (error.message && (error.message.includes('unsupported') || error.message.includes('DECODER'))) {
      console.error('💡 Private key format issue detected. Check:');
      console.error('1. Private key should have proper newlines');
      console.error('2. Private key should not have extra spaces or characters');
      console.error('3. Private key should be properly escaped in environment variables');
    }
    throw error;
  }
}

export async function testAuth() {
  const auth = getServiceAccountAuth();
  try {
    if (auth instanceof google.auth.JWT) {
      await auth.authorize();
    } else {
      // For OAuth2Client, we don't need to call authorize
      console.log('OAuth2Client auth ready');
    }
    console.log('Google service account auth successful');
    return true;
  } catch (error: any) {
    console.error('Google service account auth failed:', error.message);
    if (error.message.includes('invalid_grant')) {
      console.error('Invalid credentials - check GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY');
    }
    if (error.message.includes('access_denied')) {
      console.error('Access denied - check if APIs are enabled and service account has permissions');
    }
    return false;
  }
}

// Helper function to clear user tokens (for testing)
export async function clearUserTokens(firebaseUid: string): Promise<void> {
  try {
    initializeFirebaseAdmin();
    const db = getFirestore();
    await db.collection('user_tokens').doc(firebaseUid).delete();
    console.log(`🔍 Debug: Cleared tokens for user ${firebaseUid}`);
  } catch (error) {
    console.error(`🔍 Debug: Failed to clear tokens for user ${firebaseUid}:`, error);
    throw error;
  }
}

// Helper function to check if user needs to re-authenticate
export async function checkUserAuthStatus(firebaseUid: string): Promise<{ needsReauth: boolean; authUrl?: string }> {
  try {
    const userOAuthClient = await getUserOAuthClient(firebaseUid);
    if (!userOAuthClient) {
      return { 
        needsReauth: true, 
        authUrl: getGoogleOAuthURL(firebaseUid) 
      };
    }
    
    // Try to get user info to verify the tokens work
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: userOAuthClient });
      await oauth2.userinfo.get();
      return { needsReauth: false };
    } catch (error: any) {
      console.log(`🔍 Debug: User ${firebaseUid} needs re-authentication:`, error.message);
      return { 
        needsReauth: true, 
        authUrl: getGoogleOAuthURL(firebaseUid) 
      };
    }
  } catch (error) {
    console.error(`🔍 Debug: Error checking auth status for user ${firebaseUid}:`, error);
    return { 
      needsReauth: true, 
      authUrl: getGoogleOAuthURL(firebaseUid) 
    };
  }
}