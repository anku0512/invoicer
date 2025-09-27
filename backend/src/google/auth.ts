import { google } from 'googleapis';
import { env } from '../config/env';
import { OAuth2Client } from 'google-auth-library';

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

// Store the current user's auth client
let currentUserAuth: OAuth2Client | null = null;

export function setUserAuth(auth: OAuth2Client) {
  currentUserAuth = auth;
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