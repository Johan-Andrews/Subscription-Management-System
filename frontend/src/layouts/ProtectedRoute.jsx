import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { Spinner } from '../components/Spinner';

export const ProtectedRoute = ({ children, roles = [] }) => {
  const { session, user, loading, role } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-canvas">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!session || !user) {
    const path = location.pathname + location.search;
    const next = path && path !== '/' && !path.startsWith('/login') ? `?next=${encodeURIComponent(path)}` : '';
    return <Navigate to={`/login${next}`} replace />;
  }

  if (roles.length > 0 && !roles.includes(role)) {
    // If authenticated user does not have permission for this route
    if (role === 'CUSTOMER') {
      return <Navigate to="/portal/profile" replace />;
    }
    return <Navigate to="/customers" replace />;
  }

  return children;
};

export default ProtectedRoute;

