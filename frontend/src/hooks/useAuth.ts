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
      }
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
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
