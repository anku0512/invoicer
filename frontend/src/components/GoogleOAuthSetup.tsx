import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiCall } from '../utils/api';

const GoogleOAuthSetup: React.FC = () => {
  const { userData } = useAuth();
  const [authUrl, setAuthUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const getOAuthUrl = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      if (!userData?.uid) {
        setError('User not authenticated. Please log in first.');
        setLoading(false);
        return;
      }
      
      console.log('🔍 Debug: ===== FRONTEND OAUTH URL REQUEST START =====');
      console.log('🔍 Debug: Getting OAuth URL for Firebase UID:', userData.uid);
      console.log('🔍 Debug: User data:', userData);
      console.log('🔍 Debug: Timestamp:', new Date().toISOString());
      
      const response = await apiCall(`/api/oauth/url?firebaseUid=${encodeURIComponent(userData.uid)}`);
      const data = await response.json();
      
      console.log('🔍 Debug: OAuth URL response:', data);
      console.log('🔍 Debug: ===== FRONTEND OAUTH URL REQUEST END =====');
      
      if (data.authUrl) {
        setAuthUrl(data.authUrl);
      } else {
        setError('Failed to get OAuth URL');
      }
    } catch (err) {
      console.error('🔍 Debug: Error getting OAuth URL:', err);
      setError('Failed to connect to backend');
    } finally {
      setLoading(false);
    }
  }, [userData]);

  const handleOAuthClick = () => {
    if (authUrl) {
      console.log('🔍 Debug: ===== FRONTEND OAUTH CLICK START =====');
      console.log('🔍 Debug: Opening OAuth URL:', authUrl);
      console.log('🔍 Debug: User data:', userData);
      console.log('🔍 Debug: Timestamp:', new Date().toISOString());
      
      window.open(authUrl, '_blank', 'width=600,height=600');
      
      // Listen for OAuth completion message
      const handleMessage = (event: MessageEvent) => {
        console.log('🔍 Debug: Received message:', event.data);
        if (event.data.type === 'oauth-complete' && event.data.success) {
          console.log('🔍 Debug: OAuth completed successfully');
          console.log('🔍 Debug: ===== FRONTEND OAUTH COMPLETE =====');
          // Refresh the page or trigger a re-fetch of data
          window.location.reload();
        }
      };
      
      window.addEventListener('message', handleMessage);
      
      // Clean up listener after 5 minutes
      setTimeout(() => {
        window.removeEventListener('message', handleMessage);
      }, 300000);
      
      console.log('🔍 Debug: ===== FRONTEND OAUTH CLICK END =====');
    }
  };

  useEffect(() => {
    getOAuthUrl();
  }, [getOAuthUrl]);

  return (
    <div className="max-w-md mx-auto bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        Google OAuth Setup Required
      </h3>
      
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          To process Google Drive files and write to Google Sheets, you need to authorize access to your Google account.
        </p>
        
        <div className="p-2 bg-gray-50 rounded text-xs">
          <p><strong>Debug Info:</strong></p>
          <p>Firebase UID: {userData?.uid || 'Not available'}</p>
          <p>User Email: {userData?.email || 'Not available'}</p>
        </div>
        
        {error && (
          <div className="p-3 bg-red-50 rounded-md">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        
        <button
          onClick={handleOAuthClick}
          disabled={loading || !authUrl}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Loading...' : 'Authorize Google Access'}
        </button>
        
        <p className="text-xs text-gray-500">
          This will open a new window for Google authorization. After completing the authorization, you can return to process your files.
        </p>
      </div>
    </div>
  );
};

export default GoogleOAuthSetup;
