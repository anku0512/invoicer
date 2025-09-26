import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

const UserSettings: React.FC = () => {
  const { userData, updateUserData, logout } = useAuth();
  const [sheetId, setSheetId] = useState(userData?.sheetId || '');
  const [emailLabel, setEmailLabel] = useState(userData?.emailLabel || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      await updateUserData({
        sheetId: sheetId.trim(),
        emailLabel: emailLabel.trim()
      });
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Error logging out:', error);
      alert('Failed to logout. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
            <button
              onClick={handleLogout}
              className="text-sm text-red-600 hover:text-red-800"
            >
              Logout
            </button>
          </div>

          <div className="mb-4">
            <p className="text-sm text-gray-600">
              Welcome, <span className="font-medium">{userData?.displayName}</span>
            </p>
            <p className="text-xs text-gray-500">{userData?.email}</p>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label htmlFor="sheetId" className="block text-sm font-medium text-gray-700">
                Google Sheet ID
              </label>
              <input
                type="text"
                id="sheetId"
                value={sheetId}
                onChange={(e) => setSheetId(e.target.value)}
                placeholder="Enter your Google Sheet ID"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                The ID from your Google Sheet URL (e.g., 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms)
              </p>
            </div>

            <div>
              <label htmlFor="emailLabel" className="block text-sm font-medium text-gray-700">
                Gmail Label
              </label>
              <input
                type="text"
                id="emailLabel"
                value={emailLabel}
                onChange={(e) => setEmailLabel(e.target.value)}
                placeholder="Enter Gmail label name (e.g., Invoices)"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Create a label in Gmail and add it to emails with invoice attachments
              </p>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </form>

          <div className="mt-6 p-4 bg-blue-50 rounded-md">
            <h3 className="text-sm font-medium text-blue-800 mb-2">How it works:</h3>
            <ol className="text-xs text-blue-700 space-y-1">
              <li>1. Add the specified label to emails with invoice attachments</li>
              <li>2. Our system checks every 10 minutes for new emails with this label</li>
              <li>3. Invoice files are downloaded and processed automatically</li>
              <li>4. Results are added to your Google Sheet</li>
            </ol>
          </div>

          {userData?.lastProcessed && (
            <div className="mt-4 p-3 bg-green-50 rounded-md">
              <p className="text-xs text-green-700">
                Last processed: {new Date(userData.lastProcessed).toLocaleString()}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserSettings;
