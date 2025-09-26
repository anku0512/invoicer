import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { env } from '../config/env';

const firebaseConfig = {
  projectId: env.FIREBASE_PROJECT_ID || '',
  privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') || '',
  clientEmail: env.FIREBASE_CLIENT_EMAIL || '',
};

// Initialize Firebase Admin if not already initialized
if (getApps().length === 0) {
  initializeApp({
    credential: cert(firebaseConfig),
    projectId: env.FIREBASE_PROJECT_ID,
  });
}

export const db = getFirestore();
