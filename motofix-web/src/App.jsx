import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import AuthCallback from './pages/AuthCallback';

import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';

import Landing from './pages/Landing';
import Login from './pages/Login';
import AdminLogin from './pages/AdminLogin';
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
import SuperAdminDashboard from './pages/admin/SuperAdminDashboard';
import AdminBookings from './pages/admin/AdminBookings';
import AdminBookingDetails from './pages/admin/AdminBookingDetails';
import AdminWalkInQueue from './pages/admin/AdminWalkInQueue';
import AdminParts from './pages/admin/AdminParts';
import AdminServices from './pages/admin/AdminServices';
import AdminChat from './pages/admin/AdminChat';
import AdminOrders from './pages/admin/AdminOrders';
import AdminOrderDetails from './pages/admin/AdminOrderDetails';
import AdminReports from './pages/admin/AdminReports';
import AdminAssessments from './pages/admin/AdminAssessments';
import AdminSettings from './pages/admin/AdminSettings';
import AdminUsers from './pages/admin/AdminUsers';
import AdminInventoryMovements from './pages/admin/AdminInventoryMovements';
import AdminChatbotTemplates from './pages/admin/AdminChatbotTemplates';

import StaffDashboard from './pages/staff/StaffDashboard';

const ADMIN_PORTAL_ROLES = ['admin', 'super_admin'];
const SUPER_ADMIN_ONLY = ['super_admin'];
const STAFF_PORTAL_ROLES = ['staff', 'admin', 'super_admin'];
const MECHANIC_PORTAL_ROLES = ['mechanic', 'admin', 'super_admin'];
const CHAT_PORTAL_ROLES = ['admin', 'super_admin', 'mechanic', 'staff'];

function RoleBasedDashboard() {
  const { profile } = useAuth();
  const role = profile?.role;

  if (role === 'admin' || role === 'super_admin') {
    return <Navigate to="/admin" replace />;
  }

  if (role === 'staff') {
    return <Navigate to="/staff" replace />;
  }

  if (role === 'mechanic') {
    return <Navigate to="/mechanic-dashboard" replace />;
  }

  return <Dashboard />;
}

function AdminHome() {
  const { profile } = useAuth();

  if (profile?.role === 'super_admin') {
    return <SuperAdminDashboard />;
  }

  return <AdminDashboard />;
}

function RootPage() {
  const hostname = window.location.hostname.toLowerCase();

  if (hostname.startsWith('admin.')) {
    return <Navigate to="/admin/login" replace />;
  }

  return <Landing />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <Navbar />

          <Routes>
            {/* Public */}
              <Route path="/" element={<RootPage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/register" element={<Register />} />
              <Route
  path="/mechanics"
  element={
    <ProtectedRoute>
      <Mechanics />
    </ProtectedRoute>
  }
/>
              <Route path="/auth/callback" element={<AuthCallback />} />

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
                <ProtectedRoute>
                  <RoleBasedDashboard />
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
                <ProtectedRoute allowedRoles={STAFF_PORTAL_ROLES}>
                  <StaffDashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/staff/bookings/:bookingId"
              element={
                <ProtectedRoute allowedRoles={STAFF_PORTAL_ROLES}>
                  <AdminBookingDetails />
                </ProtectedRoute>
              }
            />

            <Route
              path="/staff/orders/:orderId"
              element={
                <ProtectedRoute allowedRoles={STAFF_PORTAL_ROLES}>
                  <AdminOrderDetails />
                </ProtectedRoute>
              }
            />

            {/* Mechanic */}
            <Route
              path="/mechanic-dashboard"
              element={
                <ProtectedRoute allowedRoles={MECHANIC_PORTAL_ROLES}>
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
                <ProtectedRoute allowedRoles={ADMIN_PORTAL_ROLES}>
                  <AdminHome />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/settings"
              element={
                <ProtectedRoute allowedRoles={SUPER_ADMIN_ONLY}>
                  <AdminSettings />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/bookings"
              element={
                <ProtectedRoute allowedRoles={ADMIN_PORTAL_ROLES}>
                  <AdminBookings />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/bookings/:bookingId"
              element={
                <ProtectedRoute allowedRoles={ADMIN_PORTAL_ROLES}>
                  <AdminBookingDetails />
                </ProtectedRoute>
              }
            />


            <Route
              path="/admin/walk-in-queue"
              element={
                <ProtectedRoute allowedRoles={ADMIN_PORTAL_ROLES}>
                  <AdminWalkInQueue />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/parts"
              element={
                <ProtectedRoute allowedRoles={ADMIN_PORTAL_ROLES}>
                  <AdminParts />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/inventory-movements"
              element={
                <ProtectedRoute allowedRoles={SUPER_ADMIN_ONLY}>
                  <AdminInventoryMovements />
                </ProtectedRoute>
              }
            />

            <Route
  path="/admin/chatbot-templates"
  element={
    <ProtectedRoute allowedRoles={ADMIN_PORTAL_ROLES}>
      <AdminChatbotTemplates />
    </ProtectedRoute>
  }
/>

            <Route
              path="/admin/services"
              element={
                <ProtectedRoute allowedRoles={SUPER_ADMIN_ONLY}>
                  <AdminServices />
                </ProtectedRoute>
              }
            />

            {/* Legacy Mechanic Route Redirect */}
            <Route
              path="/admin/mechanics"
              element={
                <ProtectedRoute allowedRoles={ADMIN_PORTAL_ROLES}>
                  <Navigate to="/admin/users" replace />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/chat"
              element={
                <ProtectedRoute allowedRoles={CHAT_PORTAL_ROLES}>
                  <AdminChat />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/orders"
              element={
                <ProtectedRoute allowedRoles={ADMIN_PORTAL_ROLES}>
                  <AdminOrders />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/orders/:orderId"
              element={
                <ProtectedRoute allowedRoles={ADMIN_PORTAL_ROLES}>
                  <AdminOrderDetails />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/reports"
              element={
                <ProtectedRoute allowedRoles={SUPER_ADMIN_ONLY}>
                  <AdminReports />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/assessments"
              element={
                <ProtectedRoute allowedRoles={ADMIN_PORTAL_ROLES}>
                  <AdminAssessments />
                </ProtectedRoute>
              }
            />

            {/* Legacy Staff Route Redirect */}
            <Route
              path="/admin/staff"
              element={
                <ProtectedRoute allowedRoles={ADMIN_PORTAL_ROLES}>
                  <Navigate to="/admin/users" replace />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/users"
              element={
                <ProtectedRoute allowedRoles={SUPER_ADMIN_ONLY}>
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