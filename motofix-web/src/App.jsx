import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

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
import Notifications from './pages/Notifications';
import BookingDetails from './pages/BookingDetails';
import OrderDetails from './pages/OrderDetails';

import AdminDashboard from './pages/admin/AdminDashboard';
import AdminBookings from './pages/admin/AdminBookings';
import AdminBookingDetails from './pages/admin/AdminBookingDetails';
import AdminParts from './pages/admin/AdminParts';
import AdminServices from './pages/admin/AdminServices';
import AdminChat from './pages/admin/AdminChat';
import AdminOrders from './pages/admin/AdminOrders';
import AdminOrderDetails from './pages/admin/AdminOrderDetails';
import AdminReports from './pages/admin/AdminReports';
import AdminAssessments from './pages/admin/AdminAssessments';
import AdminSettings from './pages/admin/AdminSettings';
import AdminUsers from './pages/admin/AdminUsers';

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

            {/* Shared Protected */}
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />

            <Route
              path="/notifications"
              element={
                <ProtectedRoute>
                  <Notifications />
                </ProtectedRoute>
              }
            />

            {/* Customer */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute allowedRoles={['customer']}>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/booking"
              element={
                <ProtectedRoute allowedRoles={['customer']}>
                  <Booking />
                </ProtectedRoute>
              }
            />

            <Route
              path="/customize"
              element={
                <ProtectedRoute allowedRoles={['customer']}>
                  <Customize />
                </ProtectedRoute>
              }
            />

            <Route
              path="/appointments"
              element={
                <ProtectedRoute allowedRoles={['customer']}>
                  <Appointments />
                </ProtectedRoute>
              }
            />

            <Route
              path="/appointments/:bookingId"
              element={
                <ProtectedRoute allowedRoles={['customer']}>
                  <BookingDetails />
                </ProtectedRoute>
              }
            />

            <Route
              path="/chat"
              element={
                <ProtectedRoute allowedRoles={['customer']}>
                  <Chat />
                </ProtectedRoute>
              }
            />

            <Route
              path="/pre-assessment"
              element={
                <ProtectedRoute allowedRoles={['customer']}>
                  <PreAssessment />
                </ProtectedRoute>
              }
            />

            <Route
              path="/my-assessments"
              element={
                <ProtectedRoute allowedRoles={['customer']}>
                  <MyAssessments />
                </ProtectedRoute>
              }
            />

            <Route
              path="/my-orders"
              element={
                <ProtectedRoute allowedRoles={['customer']}>
                  <MyOrders />
                </ProtectedRoute>
              }
            />

            <Route
              path="/my-orders/:orderId"
              element={
                <ProtectedRoute allowedRoles={['customer']}>
                  <OrderDetails />
                </ProtectedRoute>
              }
            />

            <Route
              path="/shop"
              element={
                <ProtectedRoute allowedRoles={['customer']}>
                  <Shop />
                </ProtectedRoute>
              }
            />

            <Route
              path="/checkout"
              element={
                <ProtectedRoute allowedRoles={['customer']}>
                  <Checkout />
                </ProtectedRoute>
              }
            />

            <Route
              path="/order-confirmation"
              element={
                <ProtectedRoute allowedRoles={['customer']}>
                  <OrderConfirmation />
                </ProtectedRoute>
              }
            />

            <Route
              path="/booking-confirmation"
              element={
                <ProtectedRoute allowedRoles={['customer']}>
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

            <Route
              path="/staff/bookings/:bookingId"
              element={
                <ProtectedRoute allowedRoles={['staff', 'admin']}>
                  <AdminBookingDetails />
                </ProtectedRoute>
              }
            />

            <Route
              path="/staff/orders/:orderId"
              element={
                <ProtectedRoute allowedRoles={['staff', 'admin']}>
                  <AdminOrderDetails />
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
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/settings"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminSettings />
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
              path="/admin/bookings/:bookingId"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminBookingDetails />
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

            {/* Legacy Mechanic Route Redirect */}
            <Route
              path="/admin/mechanics"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Navigate to="/admin/users" replace />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/chat"
              element={
                <ProtectedRoute allowedRoles={['admin', 'mechanic', 'staff']}>
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
              path="/admin/orders/:orderId"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminOrderDetails />
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

            {/* Legacy Staff Route Redirect */}
            <Route
              path="/admin/staff"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Navigate to="/admin/users" replace />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/users"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminUsers />
                </ProtectedRoute>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}