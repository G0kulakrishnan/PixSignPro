import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, Share2, Eye, Calendar, HardDrive } from 'lucide-react';
import { Layout, PageHeader } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { api } from '../api/client';
import type { MediaItem } from '../types';

interface MediaStats {
  downloads: number;
  shares: number;
  views: number;
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-4">
      <div className={`p-3 rounded-xl ${color} flex-shrink-0`}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-3xl font-bold text-gray-900">{value.toLocaleString()}</p>
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

export function MediaAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: media, isLoading: mediaLoading } = useQuery({
    queryKey: ['media', id],
    queryFn: () => api<MediaItem>(`/media/${id}`),
    enabled: !!id,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['media', id, 'analytics'],
    queryFn: () => api<MediaStats>(`/media/${id}/analytics`),
    enabled: !!id,
  });

  const isLoading = mediaLoading || statsLoading;

  const backPath = media?.type === 'video' ? '/videos' : '/images';

  return (
    <Layout>
      <PageHeader
        title="Media Analytics"
        subtitle={media?.title ?? ''}
        action={
          <button
            onClick={() => navigate(backPath)}
            className="flex items-center gap-2 border border-gray-300 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            <ArrowLeft size={15} /> Back
          </button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size={32} /></div>
      ) : (
        <div className="space-y-6">
          {/* Media info card */}
          {media && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <HardDrive size={20} className="text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 truncate">{media.title}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                  <span className="capitalize">{media.type}</span>
                  <span>·</span>
                  <span>{(media.fileSize / 1024 / 1024).toFixed(1)} MB</span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Calendar size={11} />
                    {new Date(media.createdAt).toLocaleDateString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </span>
                  <span>·</span>
                  <span className={`font-medium ${media.published ? 'text-green-600' : 'text-amber-600'}`}>
                    {media.published ? 'Published' : 'Scheduled'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Total Downloads"
              value={stats?.downloads ?? 0}
              icon={Download}
              color="bg-blue-50 text-blue-600"
            />
            <StatCard
              label="Total Shares"
              value={stats?.shares ?? 0}
              icon={Share2}
              color="bg-green-50 text-green-600"
            />
            <StatCard
              label="Total Views"
              value={stats?.views ?? 0}
              icon={Eye}
              color="bg-purple-50 text-purple-600"
            />
          </div>

          {stats && stats.downloads === 0 && stats.shares === 0 && stats.views === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-12 text-center">
              <p className="text-gray-500 font-medium">No activity yet for this media</p>
              <p className="text-sm text-gray-400 mt-1">Downloads, shares and views will appear here once your team interacts with it</p>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
