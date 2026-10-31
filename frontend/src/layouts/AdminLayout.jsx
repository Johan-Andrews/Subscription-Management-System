import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import {
  LayoutDashboard,
  Repeat,
  FileText,
  CreditCard,
  Package,
  Users,
  BarChart3,
  ShieldAlert,
  Search,
  Bell,
  HelpCircle,
  LogOut,
  ChevronDown,
} from 'lucide-react';

export const AdminLayout = ({ navItems = [] }) => {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Icon mapping for navigation items
  const getIconForPath = (path = '', label = '') => {
    const l = label.toLowerCase();
    const p = path.toLowerCase();
    if (p.includes('dash') || l.includes('home') || l.includes('dashboard')) return LayoutDashboard;
    if (p.includes('subscrip') || l.includes('subscrip')) return Repeat;
    if (p.includes('invoice') || l.includes('invoice')) return FileText;
    if (p.includes('pay') || l.includes('pay')) return CreditCard;
    if (p.includes('product') || p.includes('plan') || l.includes('product') || l.includes('plan') || l.includes('catalog')) return Package;
    if (p.includes('customer') || l.includes('customer')) return Users;
    if (p.includes('report') || l.includes('report')) return BarChart3;
    if (p.includes('staff') || p.includes('admin') || l.includes('staff') || l.includes('admin')) return ShieldAlert;
    return Users;
  };

  // Only show navItems that actually registered and match the user's role
  const visibleRailItems = navItems.filter(
    (item) => (!item.roles || item.roles.includes(role)) && !item.path?.startsWith('/portal')
  );

  const handleLogout = async () => {
    navigate('/login', { replace: true });
    await logout();
  };

  return (
    <div className="min-h-screen flex bg-surface-canvas text-surface-text">
      {/* 1. Left Rail (96px, #0A2A66) */}
      <aside className="w-[96px] bg-rail-bg flex flex-col items-center py-4 shrink-0 select-none z-30">
        {/* Brand mark */}
        <div className="w-12 h-12 rounded-xl bg-brand flex items-center justify-center text-white font-bold text-[18px] mb-6 shadow-md">
          BL
        </div>

        {/* Dynamic rail items from registered modules only */}
        <nav className="flex flex-col gap-3 w-full px-2 flex-1">
          {visibleRailItems.map((item) => {
            const Icon = item.icon || getIconForPath(item.path, item.label);
            const isActive =
              location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path));

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-white transition-all group ${
                  isActive ? 'opacity-100 font-semibold' : 'opacity-70 hover:opacity-100'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                    isActive
                      ? 'border-2 border-white bg-white/10 shadow-sm'
                      : 'group-hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-[11px] mt-1 text-center leading-tight line-clamp-1">
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 2. Top Bar (56px) */}
        <header className="h-[56px] bg-white border-b border-surface-border px-6 flex items-center justify-between shrink-0 z-20">
          {/* Centered Search */}
          <div className="flex-1 max-w-[520px]">
            <div className="relative">
              <Search className="w-4 h-4 text-surface-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search..."
                className="w-full pl-9 pr-4 py-1.5 text-[13px] bg-surface-canvas/60 border border-surface-border rounded-[8px] focus:outline-none focus:ring-2 focus:ring-brand focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* Right Action Icons & Avatar */}
          <div className="flex items-center gap-3 ml-4">
            <button
              title="Notifications"
              className="w-8 h-8 rounded-full flex items-center justify-center text-surface-muted hover:text-surface-text hover:bg-surface-canvas transition-colors"
            >
              <Bell className="w-4 h-4" />
            </button>
            <button
              title="Help"
              className="w-8 h-8 rounded-full flex items-center justify-center text-surface-muted hover:text-surface-text hover:bg-surface-canvas transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            <div className="h-6 w-[1px] bg-surface-border mx-1" />

            {/* User profile dropdown */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 p-1 rounded-full hover:bg-surface-canvas transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-brand-soft text-brand font-bold text-[13px] flex items-center justify-center">
                  {user?.fullName ? user.fullName[0].toUpperCase() : 'U'}
                </div>
                <div className="text-left hidden md:block">
                  <div className="text-[13px] font-semibold text-surface-text leading-tight">
                    {user?.fullName || 'User'}
                  </div>
                  <div className="text-[11px] text-surface-muted leading-tight">
                    {user?.role || 'STAFF'}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-surface-muted ml-1" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-[12px] border border-surface-border shadow-popover py-1.5 z-50">
                  <div className="px-4 py-2 border-b border-surface-border text-[12px] text-surface-muted">
                    Signed in as <br />
                    <span className="font-semibold text-surface-text">{user?.email}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-2 text-left text-[13px] text-status-danger hover:bg-status-danger-soft flex items-center gap-2 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* 3. Canvas Body */}
        <main className="flex-1 p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
