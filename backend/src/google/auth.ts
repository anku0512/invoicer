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
const oauth2Client = new OAuth2Client(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/oauth/callback`
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
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.refresh_token) {
      throw new Error('No refresh token received from Google OAuth');
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

// Get OAuth2Client for a specific user
export async function getUserOAuthClient(firebaseUid: string): Promise<OAuth2Client | null> {
  try {
    // Initialize Firebase Admin
    initializeFirebaseAdmin();
    const db = getFirestore();
    
    // Get user's tokens from Firestore
    const tokenDoc = await db.collection('user_tokens').doc(firebaseUid).get();
    
    if (!tokenDoc.exists) {
      console.log(`🔍 Debug: No tokens found for user ${firebaseUid}`);
      return null;
    }
    
    const tokenData = tokenDoc.data();
    if (!tokenData?.refreshToken) {
      console.log(`🔍 Debug: No refresh token found for user ${firebaseUid}`);
      return null;
    }
    
    // Create OAuth2Client with stored refresh token
    const userOAuthClient = new OAuth2Client(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/oauth/callback`
    );
    
    userOAuthClient.setCredentials({
      refresh_token: tokenData.refreshToken,
      access_token: tokenData.accessToken,
      expiry_date: tokenData.expiryDate,
    });
    
    console.log(`🔍 Debug: Created OAuth2Client for user ${firebaseUid}`);
    return userOAuthClient;
  } catch (error) {
    console.error(`🔍 Debug: Failed to get OAuth client for user ${firebaseUid}:`, error);
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
  // If we have a user auth, use that; otherwise fall back to service account
  if (currentUserAuth) {
    console.log('🔍 Debug: Using user OAuth authentication for Google Sheets');
    return currentUserAuth;
  }
  
  console.log('🔍 Debug: No user auth available, falling back to service account');
  
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
  const auth = getGoogleAuth();
  try {
    if (auth instanceof google.auth.JWT) {
      await auth.authorize();
    } else {
      // For OAuth2Client, we don't need to call authorize
      console.log('OAuth2Client auth ready');
    }
    console.log('Google auth successful');
    return true;
  } catch (error: any) {
    console.error('Google auth failed:', error.message);
    if (error.message.includes('invalid_grant')) {
      console.error('Invalid credentials - check GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY');
    }
    if (error.message.includes('access_denied')) {
      console.error('Access denied - check if APIs are enabled and service account has permissions');
    }
    return false;
  }
}