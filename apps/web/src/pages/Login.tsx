import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../api/client';
import type { SessionUser } from '../types';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export function Login() {
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ mobileNo: mobile.trim(), password }),
      });
      login(data.accessToken, data.refreshToken, data.user);
      navigate('/', { replace: true });
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'subscription_inactive' || e.code === 'subscription_expired') {
          setError('Your business subscription has expired. Please contact your administrator.');
        } else if (e.code === 'account_disabled') {
          setError('Your account has been disabled. Please contact your administrator.');
        } else {
          setError('Wrong phone number or password. Please try again.');
        }
      } else {
        setError('Could not connect. Please check your internet and try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#010b19] flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-28 h-28 mb-2">
            <img src="/logo.png" alt="PixSign Pro" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-white">PixSign Pro</h1>
          <p className="text-gray-400 mt-1 text-sm">Sign in to continue</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="mobile" className="block text-sm font-semibold text-gray-700 mb-1.5">
                Phone Number
              </label>
              <input
                id="mobile"
                type="tel"
                inputMode="numeric"
                value={mobile}
                onChange={e => setMobile(e.target.value)}
                placeholder="Enter your phone number"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
                disabled={loading}
                autoComplete="tel"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
                disabled={loading}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-400 text-white font-semibold py-3.5 rounded-xl text-base transition mt-2"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
