import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { clearTokens, setTokens } from '../api/client';
import type { SessionUser } from '../types';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (accessToken: string, refreshToken: string, user: SessionUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    const token = localStorage.getItem('px_token');
    const raw = localStorage.getItem('px_user');
    if (token && raw) {
      try {
        setState({ user: JSON.parse(raw) as SessionUser, loading: false });
        return;
      } catch { /* fall through */ }
    }
    setState({ user: null, loading: false });
  }, []);

  const login = useCallback((accessToken: string, refreshToken: string, user: SessionUser) => {
    setTokens(accessToken, refreshToken);
    localStorage.setItem('px_user', JSON.stringify(user));
    setState({ user, loading: false });
  }, []);

  const logout = useCallback(() => {
    const token = localStorage.getItem('px_token');
    if (token) {
      fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
    clearTokens();
    setState({ user: null, loading: false });
    window.location.href = '/login';
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
