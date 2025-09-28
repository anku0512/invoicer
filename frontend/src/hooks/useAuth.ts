import { useState, useEffect } from 'react';
import { 
  User, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  GoogleAuthProvider
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase/config';
import { apiCall } from '../utils/api';
import { UserData } from '../types/user';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Load user data from Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setUserData(userDoc.data() as UserData);
        }
      } else {
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      
      if (credential?.accessToken) {
        // Get the actual Google OAuth token from the user
        const googleToken = await result.user.getIdToken();
        
        // Store user data in Firestore
        const userData: UserData = {
          uid: result.user.uid,
          email: result.user.email || '',
          displayName: result.user.displayName || '',
          sheetId: '',
          emailLabel: '',
          accessToken: credential.accessToken, // Keep the original access token
          googleToken: googleToken, // Add the Google ID token
          tokenExpiry: Date.now() + (3600 * 1000), // 1 hour from now
          createdAt: new Date(),
          isActive: true
        };

        await setDoc(doc(db, 'users', result.user.uid), userData);
        setUserData(userData);
        
        // Always trigger Google OAuth setup for new login
        console.log('🔍 Debug: Firebase login successful, triggering Google OAuth setup');
        await triggerGoogleOAuthSetup(result.user.uid);
      }
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  };

  // Function to trigger Google OAuth setup
  const triggerGoogleOAuthSetup = async (firebaseUid: string) => {
    try {
      console.log('🔍 Debug: Triggering Google OAuth setup for user:', firebaseUid);
      
      // Clear any existing tokens first to ensure fresh OAuth flow
      try {
        await apiCall('/api/debug/clear-tokens', {
          method: 'POST',
          body: JSON.stringify({ firebaseUid })
        });
        console.log('🔍 Debug: Cleared existing tokens for fresh OAuth flow');
      } catch (clearError) {
        console.log('🔍 Debug: Could not clear existing tokens:', clearError);
        // Continue anyway
      }
      
      // Get OAuth URL from backend
      const response = await apiCall(`/api/oauth/url?firebaseUid=${encodeURIComponent(firebaseUid)}`);
      const data = await response.json();
      
      if (data.authUrl) {
        console.log('🔍 Debug: Opening Google OAuth URL:', data.authUrl);
        
        // Open OAuth popup
        window.open(data.authUrl, '_blank', 'width=600,height=600');
        
        // Listen for OAuth completion message
        const handleMessage = (event: MessageEvent) => {
          console.log('🔍 Debug: Received OAuth message:', event.data);
          if (event.data.type === 'oauth-complete' && event.data.success) {
            console.log('🔍 Debug: Google OAuth completed successfully');
            window.removeEventListener('message', handleMessage);
            // Refresh the page to reload user data
            window.location.reload();
          }
        };
        
        window.addEventListener('message', handleMessage);
        
        // Clean up listener after 5 minutes
        setTimeout(() => {
          window.removeEventListener('message', handleMessage);
        }, 300000);
      } else {
        console.error('🔍 Debug: Failed to get OAuth URL');
      }
    } catch (error) {
      console.error('🔍 Debug: Error triggering Google OAuth setup:', error);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const updateUserData = async (updates: Partial<UserData>) => {
    if (!user || !userData) return;
    
    try {
      const updatedData: UserData = { ...userData, ...updates };
      await setDoc(doc(db, 'users', user.uid), updatedData, { merge: true });
      setUserData(updatedData);
    } catch (error) {
      console.error('Error updating user data:', error);
      throw error;
    }
  };

  return {
    user,
    userData,
    loading,
    signInWithGoogle,
    logout,
    updateUserData
  };
}
