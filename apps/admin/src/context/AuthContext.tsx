import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { clearToken, setToken } from '../api/client';
import type { AdminUser } from '../types';

interface AuthState {
  admin: AdminUser | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (accessToken: string, admin: AdminUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ admin: null, loading: true });

  useEffect(() => {
    const token = localStorage.getItem('pxa_token');
    const raw = localStorage.getItem('pxa_user');
    if (token && raw) {
      try {
        setState({ admin: JSON.parse(raw) as AdminUser, loading: false });
        return;
      } catch { /* fall through */ }
    }
    setState({ admin: null, loading: false });
  }, []);

  const login = useCallback((accessToken: string, admin: AdminUser) => {
    setToken(accessToken);
    localStorage.setItem('pxa_user', JSON.stringify(admin));
    setState({ admin, loading: false });
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setState({ admin: null, loading: false });
    window.location.href = '/admin/login';
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
