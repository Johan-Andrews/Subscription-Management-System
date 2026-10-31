import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { ProtectedRoute } from './layouts/ProtectedRoute';
import { AdminLayout } from './layouts/AdminLayout';
import { PortalLayout } from './layouts/PortalLayout';
import { Card } from './components/Card';
import { Badge } from './components/Badge';
import { CheckCircle2, ShieldCheck, Database, Layers } from 'lucide-react';
import api from './lib/api';

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

const hasLoginRoute = publicRoutes.some((r) => r.path === '/login');

function Phase0Welcome() {
  const [backendHealth, setBackendHealth] = useState({ checking: true, ok: false });

  useEffect(() => {
    api
      .get('/health')
      .then((data) => {
        if (data?.ok) {
          setBackendHealth({ checking: false, ok: true });
        } else {
          setBackendHealth({ checking: false, ok: false });
        }
      })
      .catch(() => {
        setBackendHealth({ checking: false, ok: false });
      });
  }, []);

  return (
    <div className="min-h-screen bg-surface-canvas flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand text-white font-bold text-2xl shadow-md mb-4">
            BL
          </div>
          <h1 className="text-[28px] font-bold text-surface-text tracking-tight">
            Brightloop Subscription Management System
          </h1>
          <p className="text-[14px] text-surface-muted mt-2">
            Phase 0 Skeleton is successfully running. All foundation layers and design tokens are loaded.
          </p>
        </div>

        <Card className="mb-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-surface-border">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-status-success" />
                <div>
                  <div className="text-[14px] font-semibold text-surface-text">Frontend App Shell</div>
                  <div className="text-[12px] text-surface-muted">Vite + React 18 + Tailwind CSS + Lucide Icons</div>
                </div>
              </div>
              <Badge variant="success">Online (5173)</Badge>
            </div>

            <div className="flex items-center justify-between pb-4 border-b border-surface-border">
              <div className="flex items-center gap-3">
                <Layers className="w-5 h-5 text-brand" />
                <div>
                  <div className="text-[14px] font-semibold text-surface-text">Backend API (Express)</div>
                  <div className="text-[12px] text-surface-muted">
                    {backendHealth.checking
                      ? 'Checking connection on port 4000...'
                      : backendHealth.ok
                      ? 'Connected & healthy (/api/health ok)'
                      : 'Not reachable on port 4000'}
                  </div>
                </div>
              </div>
              <Badge variant={backendHealth.ok ? 'success' : backendHealth.checking ? 'neutral' : 'danger'}>
                {backendHealth.checking ? 'Checking...' : backendHealth.ok ? 'Healthy (4000)' : 'Offline'}
              </Badge>
            </div>

            <div className="flex items-center justify-between pb-4 border-b border-surface-border">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-status-warning" />
                <div>
                  <div className="text-[14px] font-semibold text-surface-text">Supabase & Database Migrations</div>
                  <div className="text-[12px] text-surface-muted">
                    4 migration files prepared (0001, 0100, 0200, 0300)
                  </div>
                </div>
              </div>
              <Badge variant="warning">Awaiting Credentials</Badge>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-brand" />
                <div>
                  <div className="text-[14px] font-semibold text-surface-text">Next Step: Phase 1</div>
                  <div className="text-[12px] text-surface-muted">
                    Auth, Roles, Staff accounts & Customer management (branch a/auth)
                  </div>
                </div>
              </div>
              <Badge variant="info">Ready to Start</Badge>
            </div>
          </div>
        </Card>

        <div className="p-4 rounded-[12px] bg-brand-soft border border-brand/20 text-center">
          <p className="text-[13px] text-brand font-medium">
            Provide your Supabase URL, anon key, service-role key & database URL to push migrations and begin Phase 1!
          </p>
        </div>
      </div>
    </div>
  );
}

function RootRedirect() {
  const { session, user, loading, role } = useAuth();
  if (loading) return null;
  if (!session || !user) {
    if (!hasLoginRoute) {
      return <Phase0Welcome />;
    }
    return <Navigate to="/login" replace />;
  }
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

          {/* Phase 0 fallback when /login is hit before Phase 1 is merged */}
          {!hasLoginRoute && <Route path="/login" element={<Phase0Welcome />} />}

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
                <Link
                  to="/"
                  className="px-6 py-2 rounded-full bg-brand text-white text-[14px] font-medium hover:bg-brand-hover transition-colors shadow-sm"
                >
                  Return to Home
                </Link>
              </div>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
