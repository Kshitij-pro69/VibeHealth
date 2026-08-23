import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { MainLayout } from './components/layout/MainLayout';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { ProtectedRoute } from './components/layout/ProtectedRoute';

import { Home } from './pages/Home';
import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { PatientDashboard } from './pages/patient/PatientDashboard';
import { DoctorSearch } from './pages/patient/DoctorSearch';
import { DoctorDetail } from './pages/patient/DoctorDetail';
import { DoctorDashboard } from './pages/doctor/DoctorDashboard';
import { DoctorLeaves } from './pages/doctor/DoctorLeaves';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { DoctorManagement } from './pages/admin/DoctorManagement';
import { NotFound } from './pages/NotFound';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Website Routes */}
          <Route element={<MainLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>

          {/* Patient Protected Portal */}
          <Route element={<ProtectedRoute allowedRoles={['patient']} />}>
            <Route element={<DashboardLayout />}>
              <Route path="/patient" element={<PatientDashboard />} />
              <Route path="/patient/book" element={<PatientDashboard />} />
              <Route path="/patient/records" element={<PatientDashboard />} />
              <Route path="/patient/notifications" element={<PatientDashboard />} />
              <Route path="/patient/doctors" element={<DoctorSearch />} />
              <Route path="/patient/doctors/:doctorId" element={<DoctorDetail />} />
            </Route>
          </Route>

          {/* Doctor Protected Portal */}
          <Route element={<ProtectedRoute allowedRoles={['doctor']} />}>
            <Route element={<DashboardLayout />}>
              <Route path="/doctor" element={<DoctorDashboard />} />
              <Route path="/doctor/schedule" element={<DoctorDashboard />} />
              <Route path="/doctor/leaves" element={<DoctorLeaves />} />
              <Route path="/doctor/profile" element={<DoctorDashboard />} />
            </Route>
          </Route>

          {/* Admin Protected Portal */}
          <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route element={<DashboardLayout />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/doctors" element={<DoctorManagement />} />
              <Route path="/admin/users" element={<AdminDashboard />} />
              <Route path="/admin/logs" element={<AdminDashboard />} />
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
