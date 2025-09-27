import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

const DriveUrlProcessor: React.FC = () => {
  const { userData } = useAuth();
  const [driveUrl, setDriveUrl] = useState('');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userData?.sheetId) {
      setResult({ success: false, message: 'Please configure your Google Sheet ID first' });
      return;
    }

    if (!driveUrl.trim()) {
      setResult({ success: false, message: 'Please enter a Drive URL' });
      return;
    }

    setProcessing(true);
    setResult(null);

    try {
      const response = await fetch('https://invoicer-backend-euxq.onrender.com/api/process-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          driveUrl: driveUrl.trim(),
          sheetId: userData.sheetId,
          accessToken: userData.accessToken
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setResult({ success: true, message: 'Drive URL processed successfully!' });
        setDriveUrl(''); // Clear the input
      } else {
        setResult({ success: false, message: data.error || 'Processing failed' });
      }
    } catch (error) {
      setResult({ 
        success: false, 
        message: 'Failed to connect to backend. Please try again.' 
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        Process Drive URL
      </h3>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="driveUrl" className="block text-sm font-medium text-gray-700">
            Google Drive URL
          </label>
          <input
            type="url"
            id="driveUrl"
            value={driveUrl}
            onChange={(e) => setDriveUrl(e.target.value)}
            placeholder="https://drive.google.com/file/d/..."
            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            required
          />
          <p className="mt-1 text-xs text-gray-500">
            Paste a Google Drive file URL to process it directly
          </p>
        </div>

        <button
          type="submit"
          disabled={processing || !userData?.sheetId}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {processing ? 'Processing...' : 'Process URL'}
        </button>
      </form>

      {result && (
        <div className={`mt-4 p-3 rounded-md ${
          result.success 
            ? 'bg-green-50 text-green-700' 
            : 'bg-red-50 text-red-700'
        }`}>
          <p className="text-sm">{result.message}</p>
        </div>
      )}

      {!userData?.sheetId && (
        <div className="mt-4 p-3 bg-yellow-50 rounded-md">
          <p className="text-sm text-yellow-700">
            Please configure your Google Sheet ID in settings first.
          </p>
        </div>
      )}
    </div>
  );
};

export default DriveUrlProcessor;
