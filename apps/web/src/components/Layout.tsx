import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Image, Video, Users, User, BarChart2,
  LogOut, Menu, X, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard', roles: ['business_admin', 'media_admin', 'staff'] },
  { to: '/images',    icon: Image,           label: 'Images',    roles: ['business_admin', 'media_admin', 'staff'] },
  { to: '/videos',    icon: Video,           label: 'Videos',    roles: ['business_admin', 'media_admin', 'staff'] },
  { to: '/users',     icon: Users,           label: 'Users',     roles: ['business_admin'] },
  { to: '/analytics', icon: BarChart2,       label: 'Analytics', roles: ['business_admin', 'media_admin'] },
  { to: '/profile',   icon: User,            label: 'Profile',   roles: ['business_admin', 'media_admin', 'staff'] },
] as const;

function Avatar({ name, size = 'md' }: { name?: string; size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  return (
    <div className={`${s} rounded-full bg-blue-600 flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {name?.[0]?.toUpperCase() ?? 'U'}
    </div>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const items = NAV.filter(n => n.roles.includes(user?.role as never));

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#010b19] rounded-xl flex items-center justify-center flex-shrink-0 p-1">
            <img src="/logo.png" alt="PixSign Pro" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-gray-900 text-sm leading-tight">PixSign Pro</p>
            {user?.businessName && (
              <p className="text-xs text-gray-500 truncate leading-tight">{user.businessName}</p>
            )}
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {items.map(({ to, icon: Icon, label }) => {
          const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                ${active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
            >
              <Icon size={18} strokeWidth={active ? 2.5 : 1.8} />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight size={14} className="text-blue-400" />}
            </Link>
          );
        })}
      </nav>

      {/* User card + logout */}
      <div className="px-3 pb-4 pt-3 border-t border-gray-100 space-y-1">
        <div className="flex items-center gap-3 px-3 py-2">
          <Avatar name={user?.name} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 truncate">{user?.name}</p>
            <p className="text-xs text-gray-500 capitalize leading-tight">
              {user?.role?.replace(/_/g, ' ')}
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-all"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </div>
  );
}

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  breadcrumb?: string;
}

export function PageHeader({ title, subtitle, action, breadcrumb }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        {breadcrumb && (
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">{breadcrumb}</p>
        )}
        <h1 className="text-2xl font-bold text-gray-900 leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0 ml-4">{action}</div>}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const items = NAV.filter(n => n.roles.includes(user?.role as never));
  const current = items.find(n => n.to === '/' ? pathname === '/' : pathname.startsWith(n.to));

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short',
  });
  const timeStr = now.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-white border-r border-gray-100 shadow-sm fixed inset-y-0 left-0 z-30">
        <SidebarNav />
      </aside>

      {/* Mobile sidebar drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 inset-y-0 w-64 bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <span className="font-bold text-gray-900 text-sm">Menu</span>
              <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <SidebarNav onNavigate={() => setMobileOpen(false)} />
            </div>
          </aside>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-white border-b border-gray-100 shadow-sm">
          <div className="flex items-center justify-between px-4 lg:px-6 h-14">
            {/* Left: hamburger + breadcrumb */}
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition"
                onClick={() => setMobileOpen(true)}
              >
                <Menu size={20} />
              </button>
              <div>
                <p className="text-sm font-semibold text-gray-800">{current?.label ?? 'Dashboard'}</p>
                <p className="text-xs text-gray-400 hidden sm:block leading-tight">{user?.businessName}</p>
              </div>
            </div>

            {/* Right: date/time + avatar */}
            <div className="flex items-center gap-3">
              <div className="hidden md:flex flex-col items-end">
                <p className="text-xs font-medium text-gray-700 leading-tight">{dateStr}</p>
                <p className="text-xs text-gray-400 leading-tight">{timeStr}</p>
              </div>
              <Avatar name={user?.name} />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
