import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import DermatologistReferral from './pages/DermatologistReferral';
import ContactPage from './pages/ContactPage';
import AdminClinics from './pages/AdminClinics';
import AdminDashboard from './pages/AdminDashboard';
import AdminRequests from './pages/AdminRequests';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app">
        <Routes>
          <Route path="/" element={<DermatologistReferral />} />
          <Route path="/contact" element={<ContactPage />} />
          {/* Old link from the original app */}
          <Route path="/dermatologist-referral" element={<Navigate to="/" replace />} />
          {/* Admin: every page asks for the admin key first (AdminShell) */}
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/requests" element={<AdminRequests />} />
          <Route path="/admin/clinics" element={<AdminClinics />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
