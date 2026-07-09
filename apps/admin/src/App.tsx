import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import { PageSpinner } from './components/Spinner';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { Businesses } from './pages/Businesses';
import { BusinessCreate } from './pages/BusinessCreate';
import { BusinessDetail } from './pages/BusinessDetail';
import { Plans } from './pages/Plans';
import { PlanForm } from './pages/PlanForm';
import { Users } from './pages/Users';
import { UserForm } from './pages/UserForm';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });

function ProtectedRoutes() {
  const { admin, loading } = useAuth();
  if (loading) return <PageSpinner />;
  return admin ? <Outlet /> : <Navigate to="/login" replace />;
}

function GuestRoutes() {
  const { admin, loading } = useAuth();
  if (loading) return <PageSpinner />;
  return admin ? <Navigate to="/" replace /> : <Outlet />;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter basename="/admin">
            <Routes>
              <Route element={<GuestRoutes />}>
                <Route path="/login" element={<Login />} />
              </Route>
              <Route element={<ProtectedRoutes />}>
                <Route path="/" element={<Overview />} />
                <Route path="/businesses" element={<Businesses />} />
                <Route path="/businesses/new" element={<BusinessCreate />} />
                <Route path="/businesses/:id" element={<BusinessDetail />} />
                <Route path="/users" element={<Users />} />
                <Route path="/users/new" element={<UserForm />} />
                <Route path="/users/:id/edit" element={<UserForm />} />
                <Route path="/plans" element={<Plans />} />
                <Route path="/plans/new" element={<PlanForm />} />
                <Route path="/plans/:id/edit" element={<PlanForm />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
