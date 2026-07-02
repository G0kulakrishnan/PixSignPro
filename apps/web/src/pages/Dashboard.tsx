import { useNavigate } from 'react-router-dom';
import { Image, Video, Users, User, BarChart2, ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import type { Profile } from '../types';

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api<Profile>('/profile'),
  });

  const tiles = [
    {
      label: 'Manage Images',
      icon: Image,
      color: 'bg-blue-100 text-blue-700',
      to: '/images',
      roles: ['business_admin', 'media_admin', 'staff'],
    },
    {
      label: 'Manage Videos',
      icon: Video,
      color: 'bg-purple-100 text-purple-700',
      to: '/videos',
      roles: ['business_admin', 'media_admin', 'staff'],
    },
    {
      label: 'Manage Users',
      icon: Users,
      color: 'bg-green-100 text-green-700',
      to: '/users',
      roles: ['business_admin'],
    },
    {
      label: 'Analytics',
      icon: BarChart2,
      color: 'bg-yellow-100 text-yellow-700',
      to: '/analytics',
      roles: ['business_admin', 'media_admin'],
    },
    {
      label: 'My Profile',
      icon: User,
      color: 'bg-orange-100 text-orange-700',
      to: '/profile',
      roles: ['business_admin', 'media_admin', 'staff'],
    },
  ].filter(t => t.roles.includes(user?.role ?? ''));

  function handleVisitWebsite() {
    const url = profile?.website || profile?.business?.website;
    if (url) {
      window.open(url.startsWith('http') ? url : `https://${url}`, '_blank', 'noopener,noreferrer');
    }
  }

  const hasWebsite = !!(profile?.website || profile?.business?.website);

  return (
    <Layout>
      <div className="py-6">
        <h2 className="text-xl font-bold text-gray-900 mb-0.5">
          Hello, {user?.name?.split(' ')[0] ?? 'there'}!
        </h2>
        <p className="text-gray-500 text-sm mb-6">What would you like to do?</p>

        <div className="grid grid-cols-2 gap-3">
          {tiles.map(({ label, icon: Icon, color, to }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className="bg-white rounded-2xl p-5 flex flex-col items-center gap-3 shadow-sm border border-gray-100 hover:shadow-md active:scale-95 transition-all"
            >
              <div className={`p-3 rounded-xl ${color}`}>
                <Icon size={26} />
              </div>
              <span className="text-sm font-medium text-gray-700 text-center leading-tight">{label}</span>
            </button>
          ))}

          <button
            onClick={handleVisitWebsite}
            disabled={!hasWebsite}
            className="bg-white rounded-2xl p-5 flex flex-col items-center gap-3 shadow-sm border border-gray-100 hover:shadow-md active:scale-95 transition-all disabled:opacity-50 disabled:cursor-default"
            title={hasWebsite ? undefined : 'Add your website in Profile'}
          >
            <div className="p-3 rounded-xl bg-teal-100 text-teal-700">
              <ExternalLink size={26} />
            </div>
            <span className="text-sm font-medium text-gray-700 text-center leading-tight">Visit Website</span>
          </button>
        </div>
      </div>
    </Layout>
  );
}
