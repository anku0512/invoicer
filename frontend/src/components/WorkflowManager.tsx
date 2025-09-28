import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import GoogleOAuthSetup from './GoogleOAuthSetup';

interface GoogleSheet {
  id: string;
  name: string;
  url: string;
  createdTime: string;
  modifiedTime: string;
}

interface WorkflowState {
  driveFolderUrl: string;
  selectedSheetId: string;
  selectedSheetName: string;
  newSheetName: string;
  showCreateSheet: boolean;
  processing: boolean;
  result: { success: boolean; message: string; needsOAuth?: boolean; authUrl?: string } | null;
}

const WorkflowManager: React.FC = () => {
  const { userData, logout } = useAuth();
  const [sheets, setSheets] = useState<GoogleSheet[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [workflow, setWorkflow] = useState<WorkflowState>({
    driveFolderUrl: '',
    selectedSheetId: '',
    selectedSheetName: '',
    newSheetName: '',
    showCreateSheet: false,
    processing: false,
    result: null
  });

  const fetchUserSheets = useCallback(async () => {
    setLoadingSheets(true);
    try {
      const response = await fetch(`https://invoicer-backend-euxq.onrender.com/api/workflow/sheets?firebaseUid=${userData?.uid}`);
      const data = await response.json();
      
      if (data.success) {
        setSheets(data.sheets);
        console.log(`Fetched ${data.count} sheets`);
      } else {
        if (data.error?.includes('not authenticated with Google')) {
          setWorkflow(prev => ({
            ...prev,
            result: { 
              success: false, 
              message: 'Google OAuth required. Please complete the authorization first.',
              needsOAuth: true,
              authUrl: data.authUrl
            }
          }));
        } else {
          console.error('Error fetching sheets:', data.error);
        }
      }
    } catch (error) {
      console.error('Error fetching sheets:', error);
    } finally {
      setLoadingSheets(false);
    }
  }, [userData?.uid]);

  // Fetch user's Google Sheets on component mount
  useEffect(() => {
    if (userData?.uid) {
      fetchUserSheets();
    }
  }, [userData?.uid, fetchUserSheets]);

  const handleCreateSheet = async () => {
    if (!workflow.newSheetName.trim()) {
      setWorkflow(prev => ({
        ...prev,
        result: { success: false, message: 'Please enter a sheet name' }
      }));
      return;
    }

    setWorkflow(prev => ({ ...prev, processing: true, result: null }));

    try {
      const response = await fetch('https://invoicer-backend-euxq.onrender.com/api/workflow/sheets/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: workflow.newSheetName.trim(),
          firebaseUid: userData?.uid
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        // Add the new sheet to the sheets list immediately
        const newSheet: GoogleSheet = {
          id: data.sheetId,
          name: workflow.newSheetName.trim(),
          url: data.sheetUrl,
          createdTime: new Date().toISOString(),
          modifiedTime: new Date().toISOString()
        };
        
        setSheets(prev => [newSheet, ...prev]);
        
        setWorkflow(prev => ({
          ...prev,
          selectedSheetId: data.sheetId,
          selectedSheetName: workflow.newSheetName.trim(),
          showCreateSheet: false,
          newSheetName: '',
          result: { success: true, message: 'Sheet created successfully!' }
        }));
      } else {
        if (data.error?.includes('not authenticated with Google')) {
          setWorkflow(prev => ({
            ...prev,
            result: { 
              success: false, 
              message: 'Google OAuth required. Please complete the authorization first.',
              needsOAuth: true,
              authUrl: data.authUrl
            }
          }));
        } else {
          setWorkflow(prev => ({
            ...prev,
            result: { success: false, message: data.error || 'Failed to create sheet' }
          }));
        }
      }
    } catch (error) {
      setWorkflow(prev => ({
        ...prev,
        result: { success: false, message: 'Failed to create sheet. Please try again.' }
      }));
    } finally {
      setWorkflow(prev => ({ ...prev, processing: false }));
    }
  };

  const handleProcessFolder = async () => {
    if (!workflow.driveFolderUrl.trim()) {
      setWorkflow(prev => ({
        ...prev,
        result: { success: false, message: 'Please enter a Drive folder URL' }
      }));
      return;
    }

    if (!workflow.selectedSheetId) {
      setWorkflow(prev => ({
        ...prev,
        result: { success: false, message: 'Please select or create a Google Sheet' }
      }));
      return;
    }

    // Extract folder ID from Drive URL
    const folderIdMatch = workflow.driveFolderUrl.match(/\/folders\/([a-zA-Z0-9-_]+)/);
    if (!folderIdMatch) {
      setWorkflow(prev => ({
        ...prev,
        result: { success: false, message: 'Invalid Google Drive folder URL format' }
      }));
      return;
    }

    const folderId = folderIdMatch[1];
    setWorkflow(prev => ({ ...prev, processing: true, result: null }));

    try {
      const response = await fetch('https://invoicer-backend-euxq.onrender.com/api/workflow/process-folder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folderId,
          sheetId: workflow.selectedSheetId,
          firebaseUid: userData?.uid
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setWorkflow(prev => ({
          ...prev,
          result: { success: true, message: data.message }
        }));
      } else {
        if (data.error?.includes('not authenticated with Google')) {
          setWorkflow(prev => ({
            ...prev,
            result: { 
              success: false, 
              message: 'Google OAuth required. Please complete the authorization first.',
              needsOAuth: true,
              authUrl: data.authUrl
            }
          }));
        } else {
          setWorkflow(prev => ({
            ...prev,
            result: { success: false, message: data.error || 'Failed to process folder' }
          }));
        }
      }
    } catch (error) {
      setWorkflow(prev => ({
        ...prev,
        result: { success: false, message: 'Failed to process folder. Please try again.' }
      }));
    } finally {
      setWorkflow(prev => ({ ...prev, processing: false }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Invoice Processing Workflow</h2>
              <p className="text-sm text-gray-600 mt-2">
                Set up automated invoice processing from Google Drive folders to Google Sheets
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                to="/settings"
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                Settings
              </Link>
              <span className="text-gray-300">|</span>
              <button
                onClick={logout}
                className="text-sm text-red-600 hover:text-red-800"
              >
                Logout
              </button>
            </div>
          </div>

          {/* Input Section */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Input: Google Drive Folder</h3>
            <div>
              <label htmlFor="driveFolderUrl" className="block text-sm font-medium text-gray-700">
                Google Drive Folder URL
              </label>
              <input
                type="url"
                id="driveFolderUrl"
                value={workflow.driveFolderUrl}
                onChange={(e) => setWorkflow(prev => ({ ...prev, driveFolderUrl: e.target.value }))}
                placeholder="https://drive.google.com/drive/folders/..."
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Paste the URL of the Google Drive folder containing your invoice files (PDF, images, etc.)
              </p>
            </div>
          </div>

          {/* Output Section */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Output: Google Sheet</h3>
            
            {/* Sheet Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Existing Sheet
              </label>
              {loadingSheets ? (
                <div className="text-sm text-gray-500">Loading sheets...</div>
              ) : (
                <select
                  value={workflow.selectedSheetId}
                  onChange={(e) => {
                    const selectedSheet = sheets.find(sheet => sheet.id === e.target.value);
                    setWorkflow(prev => ({
                      ...prev,
                      selectedSheetId: e.target.value,
                      selectedSheetName: selectedSheet?.name || '',
                      showCreateSheet: false
                    }));
                  }}
                  className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">Select a sheet...</option>
                  {sheets.map(sheet => (
                    <option key={sheet.id} value={sheet.id}>
                      {sheet.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Create New Sheet Option */}
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setWorkflow(prev => ({ ...prev, showCreateSheet: !prev.showCreateSheet }))}
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                {workflow.showCreateSheet ? 'Cancel' : '+ Create New Sheet'}
              </button>
            </div>

            {/* Create New Sheet Form */}
            {workflow.showCreateSheet && (
              <div className="mb-4 p-4 bg-gray-50 rounded-md">
                <label htmlFor="newSheetName" className="block text-sm font-medium text-gray-700">
                  New Sheet Name
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    id="newSheetName"
                    value={workflow.newSheetName}
                    onChange={(e) => setWorkflow(prev => ({ ...prev, newSheetName: e.target.value }))}
                    placeholder="Enter sheet name"
                    className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleCreateSheet}
                    disabled={workflow.processing}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {workflow.processing ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </div>
            )}

            {/* Selected Sheet Display */}
            {workflow.selectedSheetId && (
              <div className="p-3 bg-green-50 rounded-md">
                <p className="text-sm text-green-700">
                  Selected: <span className="font-medium">{workflow.selectedSheetName}</span>
                </p>
              </div>
            )}
          </div>

          {/* Process Button */}
          <div className="mb-6">
            <button
              onClick={handleProcessFolder}
              disabled={workflow.processing || !workflow.driveFolderUrl || !workflow.selectedSheetId}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {workflow.processing ? 'Processing...' : 'Start Processing'}
            </button>
          </div>

          {/* Result Display */}
          {workflow.result && (
            <div className={`p-3 rounded-md ${
              workflow.result.success 
                ? 'bg-green-50 text-green-700' 
                : 'bg-red-50 text-red-700'
            }`}>
              <p className="text-sm">{workflow.result.message}</p>
              {workflow.result.needsOAuth && (
                <div className="mt-3">
                  <GoogleOAuthSetup />
                </div>
              )}
            </div>
          )}

          {/* Instructions */}
          <div className="mt-6 p-4 bg-blue-50 rounded-md">
            <h3 className="text-sm font-medium text-blue-800 mb-2">How it works:</h3>
            <ol className="text-xs text-blue-700 space-y-1">
              <li>1. Provide a Google Drive folder URL containing your invoice files</li>
              <li>2. Select an existing Google Sheet or create a new one</li>
              <li>3. The system will process all supported files (PDF, images, etc.) in the folder</li>
              <li>4. Extracted invoice data will be written to your selected Google Sheet</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowManager;
