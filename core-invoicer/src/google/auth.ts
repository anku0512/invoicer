import { google } from 'googleapis';
import { env } from '../config/env';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
];

export function getGoogleAuth() {
  try {
    const jwt = new google.auth.JWT({
      email: env.GOOGLE_CLIENT_EMAIL,
      key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
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
    await auth.authorize();
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
