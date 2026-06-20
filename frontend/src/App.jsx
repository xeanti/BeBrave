import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Booking from './pages/Booking';
import Customize from './pages/Customize';
import Profile from './pages/Profile';
import Appointments from './pages/Appointments';
import Mechanics from './pages/Mechanics';
import MechanicDashboard from './pages/MechanicDashboard';
import Chat from './pages/Chat';
import PreAssessment from './pages/PreAssessment';
import MyAssessments from './pages/MyAssessments';
import MyOrders from './pages/MyOrders';
import Shop from './pages/Shop';
import Checkout from './pages/Checkout';
import OrderConfirmation from './pages/OrderConfirmation';
import BookingConfirmation from './pages/BookingConfirmation';
import MechanicRatings from './pages/MechanicRatings';

import AdminDashboard from './pages/admin/AdminDashboard';
import AdminBookings from './pages/admin/AdminBookings';
import AdminParts from './pages/admin/AdminParts';
import AdminServices from './pages/admin/AdminServices';
import AdminMechanics from './pages/admin/AdminMechanics';
import AdminChat from './pages/admin/AdminChat';
import AdminOrders from './pages/admin/AdminOrders';
import AdminReports from './pages/admin/AdminReports';
import AdminAssessments from './pages/admin/AdminAssessments';
import AdminStaff from './pages/admin/AdminStaff';
import AdminSettings from './pages/admin/AdminSettings';


import StaffDashboard from './pages/staff/StaffDashboard';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <Navbar />

          <Routes>
            {/* Public */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/mechanics" element={<Mechanics />} />

            {/* Customer */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/booking"
              element={
                <ProtectedRoute>
                  <Booking />
                </ProtectedRoute>
              }
            />

            <Route
              path="/customize"
              element={
                <ProtectedRoute>
                  <Customize />
                </ProtectedRoute>
              }
            />

            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />

            <Route
              path="/appointments"
              element={
                <ProtectedRoute>
                  <Appointments />
                </ProtectedRoute>
              }
            />

            <Route
              path="/chat"
              element={
                <ProtectedRoute>
                  <Chat />
                </ProtectedRoute>
              }
            />

            <Route
              path="/pre-assessment"
              element={
                <ProtectedRoute>
                  <PreAssessment />
                </ProtectedRoute>
              }
            />

            <Route
              path="/my-assessments"
              element={
                <ProtectedRoute>
                  <MyAssessments />
                </ProtectedRoute>
              }
            />

            <Route
              path="/my-orders"
              element={
                <ProtectedRoute>
                  <MyOrders />
                </ProtectedRoute>
              }
            />

            <Route
              path="/shop"
              element={
                <ProtectedRoute>
                  <Shop />
                </ProtectedRoute>
              }
            />

            <Route
              path="/checkout"
              element={
                <ProtectedRoute>
                  <Checkout />
                </ProtectedRoute>
              }
            />

            <Route
              path="/order-confirmation"
              element={
                <ProtectedRoute>
                  <OrderConfirmation />
                </ProtectedRoute>
              }
            />

            <Route
              path="/booking-confirmation"
              element={
                <ProtectedRoute>
                  <BookingConfirmation />
                </ProtectedRoute>
              }
            />

            {/* Staff */}
            <Route
              path="/staff"
              element={
                <ProtectedRoute allowedRoles={['staff', 'admin']}>
                  <StaffDashboard />
                </ProtectedRoute>
              }
            />

            {/* Mechanic */}
            <Route
              path="/mechanic-dashboard"
              element={
                <ProtectedRoute allowedRoles={['mechanic', 'admin']}>
                  <MechanicDashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/mechanic-ratings"
              element={
                <ProtectedRoute allowedRoles={['mechanic']}>
                  <MechanicRatings />
                </ProtectedRoute>
              }
            />

            {/* Admin */}
            <Route path="/admin/settings" element={
  <ProtectedRoute allowedRoles={['admin']}>
    <AdminSettings />
  </ProtectedRoute>
} />

            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/bookings"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminBookings />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/parts"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminParts />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/services"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminServices />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/mechanics"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminMechanics />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/chat"
              element={
                <ProtectedRoute allowedRoles={['admin', 'mechanic']}>
                  <AdminChat />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/orders"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminOrders />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/reports"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminReports />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/assessments"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminAssessments />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/staff"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminStaff />
                </ProtectedRoute>
              }
            />
          </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}