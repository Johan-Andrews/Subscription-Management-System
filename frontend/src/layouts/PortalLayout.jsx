import React, { useState } from 'react';
import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { LogOut, ChevronDown, Repeat, FileText, CreditCard, User } from 'lucide-react';

export const PortalLayout = ({ navItems = [] }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Dynamic portal navigation items from registered modules only
  const visiblePortalNav = navItems.filter(
    (item) => item.roles?.includes('CUSTOMER') || item.path?.startsWith('/portal')
  );

  const getPortalIcon = (path = '', label = '') => {
    const l = label.toLowerCase();
    const p = path.toLowerCase();
    if (p.includes('subscrip') || l.includes('subscrip')) return Repeat;
    if (p.includes('invoice') || l.includes('invoice')) return FileText;
    if (p.includes('pay') || l.includes('pay')) return CreditCard;
    if (p.includes('profile') || l.includes('profile') || l.includes('user')) return User;
    return User;
  };

  const handleLogout = async () => {
    navigate('/login', { replace: true });
    await logout();
  };

  return (
    <div className="min-h-screen flex flex-col bg-surface-canvas text-surface-text">
      {/* Top Navigation Bar */}
      <header className="h-[64px] bg-white border-b border-surface-border px-8 flex items-center justify-between shrink-0 shadow-sm sticky top-0 z-30">
        <div className="flex items-center gap-8">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center text-white font-bold text-[16px]">
              BL
            </div>
            <span className="font-semibold text-[16px] text-surface-text tracking-tight">
              Brightloop Customer Portal
            </span>
          </div>

          {/* Dynamic registered Nav links */}
          <nav className="hidden md:flex items-center gap-1">
            {visiblePortalNav.map((item) => {
              const Icon = item.icon || getPortalIcon(item.path, item.label);
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3.5 py-2 rounded-full text-[14px] font-medium transition-colors ${
                      isActive
                        ? 'bg-brand-soft text-brand font-semibold'
                        : 'text-surface-muted hover:text-surface-text hover:bg-surface-canvas'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 p-1.5 rounded-full hover:bg-surface-canvas transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-brand-soft text-brand font-bold text-[13px] flex items-center justify-center">
              {user?.fullName ? user.fullName[0].toUpperCase() : 'C'}
            </div>
            <span className="text-[14px] font-medium text-surface-text hidden sm:inline">
              {user?.fullName || 'Customer'}
            </span>
            <ChevronDown className="w-4 h-4 text-surface-muted" />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-white rounded-[12px] border border-surface-border shadow-popover py-1.5 z-50">
              <div className="px-4 py-2 border-b border-surface-border text-[12px] text-surface-muted">
                Logged in as <br />
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
      </header>

      {/* Main Canvas */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8">
        <Outlet />
      </main>
    </div>
  );
};

export default PortalLayout;
