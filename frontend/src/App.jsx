import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { ProtectedRoute } from './layouts/ProtectedRoute';
import { AdminLayout } from './layouts/AdminLayout';
import { PortalLayout } from './layouts/PortalLayout';

import * as auth from './pages/auth/routes';
import * as users from './pages/users/routes';
import * as catalog from './pages/catalog/routes';
import * as subscriptions from './pages/subscriptions/routes';
import * as invoices from './pages/invoices/routes';
import * as payments from './pages/payments/routes';
import * as reports from './pages/reports/routes';

const modules = [auth, users, catalog, subscriptions, invoices, payments, reports];

// Consolidate all routes and navItems from modules
const allRoutes = modules.flatMap((m) => m.routes || []);
const allNavItems = modules.flatMap((m) => m.navItems || []);

const publicRoutes = allRoutes.filter((r) => r.area === 'public');
const adminRoutes = allRoutes.filter((r) => r.area === 'admin');
const portalRoutes = allRoutes.filter((r) => r.area === 'portal');

function RootRedirect() {
  const { session, user, loading, role } = useAuth();
  if (loading) return null;
  if (!session || !user) return <Navigate to="/login" replace />;
  if (role === 'CUSTOMER') return <Navigate to="/portal/subscriptions" replace />;
  return <Navigate to="/dashboard" replace />;
}

export function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      <BrowserRouter>
        <Routes>
          {/* Root redirect */}
          <Route path="/" element={<RootRedirect />} />

          {/* Public routes (Login, Signup, Forgot, Reset) */}
          {publicRoutes.map((route) => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}

          {/* Admin & Staff area routes */}
          <Route
            element={
              <ProtectedRoute roles={['ADMIN', 'STAFF']}>
                <AdminLayout navItems={allNavItems} />
              </ProtectedRoute>
            }
          >
            {adminRoutes.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={
                  route.roles ? (
                    <ProtectedRoute roles={route.roles}>{route.element}</ProtectedRoute>
                  ) : (
                    route.element
                  )
                }
              />
            ))}
          </Route>

          {/* Customer Portal area routes */}
          <Route
            element={
              <ProtectedRoute roles={['CUSTOMER']}>
                <PortalLayout />
              </ProtectedRoute>
            }
          >
            {portalRoutes.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={
                  route.roles ? (
                    <ProtectedRoute roles={route.roles}>{route.element}</ProtectedRoute>
                  ) : (
                    route.element
                  )
                }
              />
            ))}
          </Route>

          {/* Fallback 404 */}
          <Route
            path="*"
            element={
              <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-surface-canvas text-center">
                <h1 className="text-[40px] font-bold text-surface-text mb-2">404</h1>
                <p className="text-[14px] text-surface-muted mb-6">Page not found</p>
                <a
                  href="/"
                  className="px-6 py-2 rounded-full bg-brand text-white text-[14px] font-medium hover:bg-brand-hover transition-colors shadow-sm"
                >
                  Return to Home
                </a>
              </div>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

