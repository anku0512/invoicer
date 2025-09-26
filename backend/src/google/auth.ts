import { google } from 'googleapis';
import { env } from '../config/env';
import { OAuth2Client } from 'google-auth-library';

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
    return currentUserAuth;
  }
  
  try {
    const jwt = new google.auth.JWT({
      email: env.GOOGLE_CLIENT_EMAIL,
      key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: SCOPES,
    });
    return jwt;
  } catch (error) {
    console.error('Failed to create Google auth:', error);
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