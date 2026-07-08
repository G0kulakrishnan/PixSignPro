import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import { PageSpinner } from './components/Spinner';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { MediaPage } from './pages/MediaPage';
import { MediaAnalyticsPage } from './pages/MediaAnalyticsPage';
import { Users } from './pages/Users';
import { Profile } from './pages/Profile';
import { Analytics } from './pages/Analytics';

// Lazy-loaded: pulls in the xlsx parser only when the import page is opened,
// keeping it out of the main bundle.
const UsersImport = lazy(() => import('./pages/UsersImport').then((m) => ({ default: m.UsersImport })));

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <PageSpinner />;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

function GuestRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <PageSpinner />;
  return user ? <Navigate to="/" replace /> : <Outlet />;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<GuestRoutes />}>
                <Route path="/login" element={<Login />} />
              </Route>
              <Route element={<ProtectedRoutes />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/images" element={<MediaPage type="image" />} />
                <Route path="/videos" element={<MediaPage type="video" />} />
                <Route path="/media/:id/analytics" element={<MediaAnalyticsPage />} />
                <Route path="/users" element={<Users />} />
                <Route path="/users/import" element={<Suspense fallback={<PageSpinner />}><UsersImport /></Suspense>} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/analytics" element={<Analytics />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
