import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Login from './components/Login';
import UserSettings from './components/UserSettings';
import DriveUrlProcessor from './components/DriveUrlProcessor';
import './App.css';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route 
            path="/" 
            element={user ? <UserSettings /> : <Login />} 
          />
          <Route 
            path="/process" 
            element={user ? <DriveUrlProcessor /> : <Login />} 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
