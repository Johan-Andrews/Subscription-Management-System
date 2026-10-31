import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { ProtectedRoute } from './layouts/ProtectedRoute';
import { AdminLayout } from './layouts/AdminLayout';
import { PortalLayout } from './layouts/PortalLayout';
import { ComingSoon } from './components/ComingSoon';
import { Spinner } from './components/Spinner';

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

// Known paths in unmerged/stub modules to render a friendly ComingSoon component inside layout
const knownAdminModules = [
  { path: '/dashboard', title: 'Dashboard & Reports' },
  { path: '/subscriptions', title: 'Subscriptions' },
  { path: '/subscriptions/*', title: 'Subscriptions' },
  { path: '/invoices', title: 'Invoices' },
  { path: '/invoices/*', title: 'Invoices' },
  { path: '/payments', title: 'Payments' },
  { path: '/payments/*', title: 'Payments' },
  { path: '/products', title: 'Products & Variants' },
  { path: '/products/*', title: 'Products & Variants' },
  { path: '/plans', title: 'Subscription Plans' },
  { path: '/plans/*', title: 'Subscription Plans' },
  { path: '/taxes', title: 'Taxes' },
  { path: '/taxes/*', title: 'Taxes' },
  { path: '/discounts', title: 'Discounts' },
  { path: '/discounts/*', title: 'Discounts' },
  { path: '/quotation-templates', title: 'Quotation Templates' },
  { path: '/quotation-templates/*', title: 'Quotation Templates' },
  { path: '/billing', title: 'Billing Engine' },
  { path: '/billing/*', title: 'Billing Engine' },
  { path: '/reports', title: 'Reports' },
  { path: '/reports/*', title: 'Reports' },
];

const unbuiltAdminRoutes = knownAdminModules.filter(
  (m) => !adminRoutes.some((ar) => ar.path === m.path)
);

const knownPortalModules = [
  { path: '/portal/subscriptions', title: 'My Subscriptions' },
  { path: '/portal/subscriptions/*', title: 'My Subscriptions' },
  { path: '/portal/invoices', title: 'My Invoices' },
  { path: '/portal/invoices/*', title: 'My Invoices' },
  { path: '/portal/payments', title: 'My Payments' },
  { path: '/portal/payments/*', title: 'My Payments' },
];

const unbuiltPortalRoutes = knownPortalModules.filter(
  (m) => !portalRoutes.some((pr) => pr.path === m.path)
);

function getRoleHomePath(role) {
  if (role === 'CUSTOMER') {
    return '/portal/profile';
  }
  const hasDashboard = adminRoutes.some((r) => r.path === '/dashboard');
  return hasDashboard ? '/dashboard' : '/customers';
}

function RootRedirect() {
  const { session, user, loading, role } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-canvas">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!session || !user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={getRoleHomePath(role)} replace />;
}

function NotFoundPage() {
  const { session, user, role } = useAuth();
  const isAuthenticated = !!session && !!user;
  const homePath = !isAuthenticated ? '/login' : getRoleHomePath(role);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-surface-canvas text-center">
      <h1 className="text-[40px] font-bold text-surface-text mb-2">404</h1>
      <p className="text-[14px] text-surface-muted mb-6">Page not found</p>
      <Link
        to={homePath}
        className="px-6 py-2 rounded-full bg-brand text-white text-[14px] font-medium hover:bg-brand-hover transition-colors shadow-sm"
      >
        Return to home
      </Link>
    </div>
  );
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
            {/* Friendly Coming Soon views inside AdminLayout for unbuilt module routes */}
            {unbuiltAdminRoutes.map((m) => (
              <Route
                key={m.path}
                path={m.path}
                element={<ComingSoon title={m.title} area="admin" />}
              />
            ))}
          </Route>

          {/* Customer Portal area routes */}
          <Route
            element={
              <ProtectedRoute roles={['CUSTOMER']}>
                <PortalLayout navItems={allNavItems} />
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
            {/* Friendly Coming Soon views inside PortalLayout for unbuilt customer routes */}
            {unbuiltPortalRoutes.map((m) => (
              <Route
                key={m.path}
                path={m.path}
                element={<ComingSoon title={m.title} area="portal" />}
              />
            ))}
          </Route>

          {/* Fallback 404 for unknown top-level routes */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
