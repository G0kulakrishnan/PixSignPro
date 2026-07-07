import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Building2, Users as UsersIcon, CreditCard, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { ReactNode } from 'react';

// Paths are relative to the router basename ("/admin"), so no /admin prefix here.
const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Overview', exact: true },
  { to: '/businesses', icon: Building2, label: 'Businesses' },
  { to: '/users', icon: UsersIcon, label: 'Users' },
  { to: '/plans', icon: CreditCard, label: 'Plans' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { admin, logout } = useAuth();
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-[#010b19] flex flex-col fixed inset-y-0 left-0 z-10">
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-gray-700">
          <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="PixSign Pro" className="w-full h-full object-contain" />
          </div>
          <div>
            <p className="text-white font-bold text-sm">PixSign Pro</p>
            <p className="text-gray-400 text-xs">Super Admin</p>
          </div>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map(({ to, icon: Icon, label, exact }) => {
            const active = exact ? pathname === to : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition
                  ${active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-700">
          <div className="text-xs text-gray-500 mb-3 truncate">{admin?.name}</div>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-gray-400 hover:text-white text-sm w-full px-2 py-1.5 rounded hover:bg-gray-800 transition"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 ml-56 min-h-screen">
        {children}
      </main>
    </div>
  );
}
