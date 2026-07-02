import { Link, useLocation } from 'react-router-dom';
import { Home, Image, Video, Users, User, BarChart2, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { ReactNode } from 'react';

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  const navItems = [
    { to: '/', icon: Home, label: 'Home', roles: ['business_admin', 'media_admin', 'staff'] },
    { to: '/images', icon: Image, label: 'Images', roles: ['business_admin', 'media_admin', 'staff'] },
    { to: '/videos', icon: Video, label: 'Videos', roles: ['business_admin', 'media_admin', 'staff'] },
    { to: '/users', icon: Users, label: 'Users', roles: ['business_admin'] },
    { to: '/analytics', icon: BarChart2, label: 'Analytics', roles: ['business_admin', 'media_admin'] },
    { to: '/profile', icon: User, label: 'Profile', roles: ['business_admin', 'media_admin', 'staff'] },
  ].filter(item => item.roles.includes(user?.role ?? ''));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="fixed top-0 inset-x-0 h-14 bg-blue-600 flex items-center justify-between px-4 z-10 shadow">
        <div>
          <p className="text-white font-bold text-base leading-tight">PixSign Pro</p>
          {user?.businessName && (
            <p className="text-blue-200 text-xs leading-tight truncate max-w-[200px]">{user.businessName}</p>
          )}
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-blue-100 hover:text-white text-sm py-1.5 px-2 rounded-lg hover:bg-blue-700 transition"
          aria-label="Logout"
        >
          <LogOut size={18} />
        </button>
      </header>

      <main className="flex-1 pt-14 pb-20 max-w-2xl w-full mx-auto px-4">
        {children}
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex z-10">
        {navItems.map(({ to, icon: Icon, label }) => {
          const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex-1 flex flex-col items-center py-2 gap-0.5 text-xs font-medium transition
                ${active ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
