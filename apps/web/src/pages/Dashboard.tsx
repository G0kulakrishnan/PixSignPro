import { useNavigate } from 'react-router-dom';
import { Image, Video, Users, User, BarChart2, ExternalLink, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { Layout, PageHeader } from '../components/Layout';
import { api } from '../api/client';
import type { Profile, MediaItem, User as UserType } from '../types';

function StatCard({
  label, value, sub, color, icon: Icon,
}: {
  label: string; value: number | string; sub?: string;
  color: string; icon: React.ElementType;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
      <div className={`p-3 rounded-xl ${color} flex-shrink-0`}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        <p className="text-sm font-medium text-gray-600 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const QUICK_ACTIONS = [
  {
    label: 'Manage Images',
    desc: 'Upload & organise images',
    icon: Image,
    color: 'bg-blue-50 text-blue-600',
    border: 'border-blue-100',
    to: '/images',
    roles: ['business_admin', 'media_admin', 'staff'],
  },
  {
    label: 'Manage Videos',
    desc: 'Upload & organise videos',
    icon: Video,
    color: 'bg-purple-50 text-purple-600',
    border: 'border-purple-100',
    to: '/videos',
    roles: ['business_admin', 'media_admin', 'staff'],
  },
  {
    label: 'Manage Users',
    desc: 'Add & manage team members',
    icon: Users,
    color: 'bg-green-50 text-green-600',
    border: 'border-green-100',
    to: '/users',
    roles: ['business_admin'],
  },
  {
    label: 'Analytics',
    desc: 'Downloads, shares & activity',
    icon: BarChart2,
    color: 'bg-amber-50 text-amber-600',
    border: 'border-amber-100',
    to: '/analytics',
    roles: ['business_admin', 'media_admin'],
  },
  {
    label: 'My Profile',
    desc: 'Edit your info & password',
    icon: User,
    color: 'bg-orange-50 text-orange-600',
    border: 'border-orange-100',
    to: '/profile',
    roles: ['business_admin', 'media_admin', 'staff'],
  },
];

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api<Profile>('/profile'),
  });

  const { data: images = [] } = useQuery({
    queryKey: ['media', 'image'],
    queryFn: () => api<MediaItem[]>('/media?type=image'),
  });

  const { data: videos = [] } = useQuery({
    queryKey: ['media', 'video'],
    queryFn: () => api<MediaItem[]>('/media?type=video'),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api<UserType[]>('/users'),
    enabled: user?.role === 'business_admin',
  });

  const scheduledCount = [...images, ...videos].filter(
    m => m.scheduledPublishAt && !m.published,
  ).length;

  const isAdmin = user?.role === 'business_admin';
  const canViewAnalytics = user?.role !== 'staff';

  const tiles = QUICK_ACTIONS.filter(t => t.roles.includes(user?.role ?? ''));

  function handleVisitWebsite() {
    const url = profile?.website || profile?.business?.website;
    if (url) window.open(url.startsWith('http') ? url : `https://${url}`, '_blank', 'noopener,noreferrer');
  }

  const hasWebsite = !!(profile?.website || profile?.business?.website);

  return (
    <Layout>
      <PageHeader
        title={`Welcome, ${user?.name?.split(' ')[0] ?? 'there'}!`}
        subtitle="Here's what's happening with your media today."
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Images"
          value={images.length}
          color="bg-blue-50 text-blue-600"
          icon={Image}
        />
        <StatCard
          label="Total Videos"
          value={videos.length}
          color="bg-purple-50 text-purple-600"
          icon={Video}
        />
        {isAdmin && (
          <StatCard
            label="Team Members"
            value={users.length}
            color="bg-green-50 text-green-600"
            icon={Users}
          />
        )}
        {canViewAnalytics && (
          <StatCard
            label="Scheduled"
            value={scheduledCount}
            sub="awaiting publish"
            color="bg-amber-50 text-amber-600"
            icon={TrendingUp}
          />
        )}
      </div>

      {/* Quick actions */}
      <div className="mb-2">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {tiles.map(({ label, desc, icon: Icon, color, border, to }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className={`bg-white rounded-2xl border ${border} p-5 flex items-center gap-4 shadow-sm hover:shadow-md active:scale-[0.98] transition-all text-left`}
            >
              <div className={`p-3 rounded-xl ${color} flex-shrink-0`}>
                <Icon size={22} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 leading-tight">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-tight">{desc}</p>
              </div>
            </button>
          ))}

          <button
            onClick={handleVisitWebsite}
            disabled={!hasWebsite}
            className="bg-white rounded-2xl border border-teal-100 p-5 flex items-center gap-4 shadow-sm hover:shadow-md active:scale-[0.98] transition-all text-left disabled:opacity-50 disabled:cursor-default"
            title={hasWebsite ? undefined : 'Add your website URL in Profile'}
          >
            <div className="p-3 rounded-xl bg-teal-50 text-teal-600 flex-shrink-0">
              <ExternalLink size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 leading-tight">Visit Website</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-tight">
                {hasWebsite ? 'Open your business site' : 'Set website in Profile'}
              </p>
            </div>
          </button>
        </div>
      </div>
    </Layout>
  );
}
