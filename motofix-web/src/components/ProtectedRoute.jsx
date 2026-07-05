import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function normalizeRole(role) {
  return String(role || '').toLowerCase().trim();
}

function getHomeForRole(role) {
  const cleanRole = normalizeRole(role);

  switch (cleanRole) {
    case 'super_admin':
    case 'admin':
      return '/admin';

    case 'staff':
      return '/staff';

    case 'customer':
    case 'user':
      return '/dashboard';

    case 'mechanic':
      // Mechanics are mobile-only in the new setup.
      return '/login';

    default:
      return '/login';
  }
}

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-dark-900">
      <div className="flex flex-col items-center gap-4">
        <div className="text-2xl font-bold tracking-tight text-white">
          Moto<span className="text-primary-500">Fix</span>
        </div>

        <svg
          className="h-8 w-8 animate-spin text-primary-500"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-20"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-90"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8z"
          />
        </svg>

        <p className="animate-pulse text-sm text-gray-500">
          Loading your ride...
        </p>
      </div>
    </div>
  );
}

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  const [showLoader, setShowLoader] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowLoader(false);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  if (loading || showLoader) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  const role = normalizeRole(profile.role);

  // Mechanics are mobile-only and should not access protected web pages.
  if (role === 'mechanic') {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles?.length) {
    const normalizedAllowedRoles = allowedRoles.map(normalizeRole);

    if (!normalizedAllowedRoles.includes(role)) {
      return <Navigate to={getHomeForRole(role)} replace />;
    }
  }

  return children;
}
