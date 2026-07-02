import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Building2, Users, FileImage, CheckCircle2, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { api } from '../api/client';
import type { OverviewStats } from '../types';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  expired: 'bg-red-100 text-red-700',
  suspended: 'bg-yellow-100 text-yellow-700',
};

export function Overview() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => api<OverviewStats>('/admin/overview'),
    refetchInterval: 60_000,
  });

  if (isLoading) return <Layout><div className="flex justify-center py-16"><Spinner /></div></Layout>;

  const { stats, recentBusinesses } = data ?? { stats: { totalBusinesses: 0, activeBusinesses: 0, totalUsers: 0, totalMedia: 0 }, recentBusinesses: [] };

  return (
    <Layout>
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Overview</h1>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard icon={Building2} label="Total Businesses" value={stats.totalBusinesses} color="bg-blue-50 text-blue-600" />
          <StatCard icon={CheckCircle2} label="Active Businesses" value={stats.activeBusinesses} color="bg-green-50 text-green-600" />
          <StatCard icon={Users} label="Total Users" value={stats.totalUsers} color="bg-purple-50 text-purple-600" />
          <StatCard icon={FileImage} label="Total Media" value={stats.totalMedia} color="bg-orange-50 text-orange-600" />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Recent Businesses</h2>
            <Link to="/businesses" className="text-sm text-blue-600 hover:underline">View all →</Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <Th>Business</Th>
                <Th>Plan</Th>
                <Th>Status</Th>
                <Th>Users</Th>
                <Th>Media</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentBusinesses.map(b => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/businesses/${b.id}`} className="font-medium text-blue-600 hover:underline">{b.name}</Link>
                    {b.city && <p className="text-xs text-gray-400">{b.city}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{b.plan?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[b.subscriptionStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                      {b.subscriptionStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{b._count?.users ?? 0}</td>
                  <td className="px-4 py-3 text-gray-600">{b._count?.media ?? 0}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(b.createdAt)}</td>
                </tr>
              ))}
              {recentBusinesses.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No businesses yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className={`inline-flex p-2.5 rounded-lg ${color} mb-3`}>
        <Icon size={20} />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{children}</th>;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
