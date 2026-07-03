import { useRef, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Download, Trash2, Clock, Image, Film, CheckSquare, Square, BarChart2, Loader2, CalendarClock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Layout, PageHeader } from '../components/Layout';
import { ConfirmModal } from '../components/ConfirmModal';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { api, getToken } from '../api/client';
import type { MediaItem } from '../types';

interface Props { type: 'image' | 'video' }

interface ScheduledDay {
  date: string; total: number; images: number; videos: number;
  items: { id: string; title: string; type: string; scheduledPublishAt: string }[];
}
interface ScheduledSummary {
  total: number; images: number; videos: number; byDay: ScheduledDay[];
}

function AuthImage({ mediaId }: { mediaId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const token = getToken();
    let objectUrl = '';
    fetch(`/api/media/${mediaId}/preview`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => (r.ok ? r.blob() : Promise.reject()))
      .then(blob => {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => setFailed(true));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [mediaId]);

  if (failed) return (
    <div className="w-full h-full bg-gray-100 flex items-center justify-center">
      <Image size={32} className="text-gray-300" />
    </div>
  );
  if (!src) return (
    <div className="w-full h-full bg-gray-100 animate-pulse flex items-center justify-center">
      <Image size={32} className="text-gray-200" />
    </div>
  );
  return <img src={src} alt="" className="w-full h-full object-cover" />;
}

export function MediaPage({ type }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [showUpload, setShowUpload] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadTitle, setUploadTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const canUpload = user?.role !== 'staff';
  const canDelete = user?.role !== 'staff';
  const isAdmin = user?.role !== 'staff';

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['media', type],
    queryFn: () => api<MediaItem[]>(`/media?type=${type}`),
  });

  const { data: scheduled } = useQuery({
    queryKey: ['media', 'scheduled-summary'],
    queryFn: () => api<ScheduledSummary>('/media/scheduled/summary'),
    enabled: isAdmin,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/media/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['media', type] });
      toast('success', `${type === 'image' ? 'Image' : 'Video'} deleted`);
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast('error', e.message || 'Could not delete'),
  });

  async function handleDownload(item: MediaItem) {
    if (downloadingIds.has(item.id)) return;
    setDownloadingIds(prev => new Set(prev).add(item.id));
    try {
      const token = getToken();
      const res = await fetch(`/api/media/${item.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.title;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast('error', 'Could not download file');
    } finally {
      setDownloadingIds(prev => { const s = new Set(prev); s.delete(item.id); return s; });
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFiles.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      uploadFiles.forEach(f => fd.append('files', f));
      if (uploadTitle.trim()) fd.append('titles', JSON.stringify([uploadTitle.trim()]));
      if (scheduledAt) fd.append('scheduledPublishAt', new Date(scheduledAt).toISOString());
      await api('/media/upload', { method: 'POST', body: fd });
      qc.invalidateQueries({ queryKey: ['media', type] });
      qc.invalidateQueries({ queryKey: ['media', 'scheduled-summary'] });
      toast('success', `${uploadFiles.length} file${uploadFiles.length > 1 ? 's' : ''} uploaded`);
      setShowUpload(false);
      setUploadFiles([]);
      setUploadTitle('');
      setScheduledAt('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleDeleteSelected() {
    for (const id of selected) {
      await api(`/media/${id}`, { method: 'DELETE' }).catch(() => {});
    }
    qc.invalidateQueries({ queryKey: ['media', type] });
    toast('success', `${selected.size} item${selected.size > 1 ? 's' : ''} deleted`);
    setSelected(new Set());
  }

  const title = type === 'image' ? 'Images' : 'Videos';
  const accept = type === 'image' ? 'image/*' : 'video/*';

  return (
    <Layout>
      <PageHeader
        title={`Manage ${title}`}
        subtitle={`Dashboard / Manage ${title}`}
        action={
          <div className="flex items-center gap-2">
            {canDelete && selected.size > 0 && (
              <button
                onClick={() => setConfirmDeleteAll(true)}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition shadow-sm"
              >
                <Trash2 size={15} /> Delete Selected ({selected.size})
              </button>
            )}
            {canUpload && (
              <button
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition shadow-sm"
              >
                <Plus size={16} /> Upload {title}
              </button>
            )}
          </div>
        }
      />

      {isAdmin && scheduled && scheduled.total > 0 && (
        <ScheduledBanner summary={scheduled} type={type} />
      )}

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size={32} /></div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center">
          {type === 'image'
            ? <Image size={52} className="mx-auto text-gray-300 mb-3" />
            : <Film size={52} className="mx-auto text-gray-300 mb-3" />}
          <p className="text-gray-600 font-medium">No {title.toLowerCase()} yet</p>
          {canUpload && <p className="text-sm text-gray-400 mt-1">Click "Upload {title}" to add files</p>}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map(item => {
            const isSelected = selected.has(item.id);
            const isScheduled = isAdmin && item.scheduledPublishAt && !item.published;
            const publishedAt = item.scheduledPublishAt
              ? new Date(item.scheduledPublishAt)
              : new Date(item.createdAt);

            return (
              <div
                key={item.id}
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all
                  ${isSelected ? 'border-blue-400 ring-2 ring-blue-300' : 'border-gray-100 hover:shadow-md'}`}
              >
                {/* Thumbnail */}
                <div className="relative aspect-square bg-gray-100">
                  {type === 'image' ? (
                    <AuthImage mediaId={item.id} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-purple-50">
                      <Film size={40} className="text-purple-400" />
                    </div>
                  )}

                  {/* Select checkbox */}
                  {canDelete && (
                    <button
                      onClick={() => toggleSelect(item.id)}
                      className="absolute top-2 right-2 text-white drop-shadow"
                    >
                      {isSelected
                        ? <CheckSquare size={20} className="text-blue-500 bg-white rounded" />
                        : <Square size={20} className="text-gray-400 bg-white/80 rounded" />}
                    </button>
                  )}

                  {/* Scheduled badge */}
                  {isScheduled && (
                    <span className="absolute top-2 left-2 flex items-center gap-1 text-xs font-semibold bg-amber-500 text-white px-2 py-0.5 rounded-full">
                      <Clock size={10} /> Scheduled
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="px-3 pt-2.5 pb-1">
                  <p className="text-xs font-semibold text-gray-800 truncate">{item.title}</p>
                  <p className={`text-xs font-semibold mt-0.5 ${isScheduled ? 'text-amber-600' : 'text-green-600'}`}>
                    {isScheduled ? 'Scheduled' : 'Published'}
                  </p>
                  <p className="text-xs text-gray-400 mb-2">
                    {publishedAt.toLocaleString('en-IN', {
                      year: 'numeric', month: '2-digit', day: '2-digit',
                      hour: '2-digit', minute: '2-digit', hour12: true,
                    })}
                  </p>
                </div>

                {/* Actions — icon buttons */}
                <div className="px-3 pb-3 flex items-center gap-2">
                  {isAdmin && (
                    <button
                      onClick={() => navigate(`/media/${item.id}/analytics`)}
                      title="Analytics"
                      className="flex-1 flex items-center justify-center py-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition"
                    >
                      <BarChart2 size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDownload(item)}
                    disabled={downloadingIds.has(item.id)}
                    title="Download"
                    className="flex-1 flex items-center justify-center py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:bg-gray-500 transition"
                  >
                    {downloadingIds.has(item.id)
                      ? <Loader2 size={16} className="animate-spin" />
                      : <Download size={16} />}
                  </button>
                  {canDelete && (
                    <button
                      onClick={() => setDeleteTarget(item)}
                      title="Delete"
                      className="flex-1 flex items-center justify-center py-2 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-5">Upload {title}</h3>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Select files</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept={accept}
                  multiple
                  onChange={e => setUploadFiles(Array.from(e.target.files ?? []))}
                  className="block w-full text-sm text-gray-500
                    file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0
                    file:bg-blue-50 file:text-blue-700 file:font-medium hover:file:bg-blue-100"
                />
                {uploadFiles.length > 0 && (
                  <p className="text-xs text-green-600 mt-1">{uploadFiles.length} file{uploadFiles.length > 1 ? 's' : ''} selected</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Title <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={e => setUploadTitle(e.target.value)}
                  placeholder="e.g. Summer Collection"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Schedule publish <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={e => setScheduledAt(e.target.value)}
                  step={3600}
                  min={nextHourLocal()}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">Publishing runs on the hour — pick a full-hour time</p>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowUpload(false); setUploadFiles([]); setUploadTitle(''); setScheduledAt(''); }}
                  className="flex-1 border border-gray-300 rounded-xl py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !uploadFiles.length}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl py-3 text-sm font-semibold transition"
                >
                  {uploading ? <><Spinner size={16} /> Uploading…</> : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          title={`Delete ${type === 'image' ? 'Image' : 'Video'}`}
          message={`Delete "${deleteTarget.title}"? This cannot be undone.`}
          confirmLabel="Yes, delete"
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteMutation.isPending}
        />
      )}

      {confirmDeleteAll && (
        <ConfirmModal
          title={`Delete ${selected.size} ${type === 'image' ? 'Image' : 'Video'}${selected.size > 1 ? 's' : ''}`}
          message={`Are you sure you want to permanently delete ${selected.size} selected item${selected.size > 1 ? 's' : ''}? This cannot be undone.`}
          confirmLabel={`Yes, delete ${selected.size}`}
          onConfirm={async () => { setConfirmDeleteAll(false); await handleDeleteSelected(); }}
          onCancel={() => setConfirmDeleteAll(false)}
          loading={false}
        />
      )}
    </Layout>
  );
}

function nextHourLocal() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

// Banner summarising upcoming scheduled media for the current type: how many,
// and on which days. Only the count for this page's type (image/video) is shown.
function ScheduledBanner({ summary, type }: { summary: ScheduledSummary; type: 'image' | 'video' }) {
  const count = type === 'image' ? summary.images : summary.videos;
  if (count === 0) return null;

  const noun = type === 'image' ? 'image' : 'video';
  const days = summary.byDay
    .map(d => ({ ...d, typeCount: type === 'image' ? d.images : d.videos }))
    .filter(d => d.typeCount > 0);

  return (
    <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
      <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
        <CalendarClock size={17} />
        {count} {noun}{count > 1 ? 's' : ''} scheduled to publish
        {days.length > 0 && ` across ${days.length} day${days.length > 1 ? 's' : ''}`}
      </div>
      {days.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {days.map(d => (
            <span
              key={d.date}
              className="text-xs bg-white border border-amber-200 text-amber-700 rounded-full px-2.5 py-1 font-medium"
              title={`${d.typeCount} ${noun}${d.typeCount > 1 ? 's' : ''} on this day`}
            >
              {new Date(d.date + 'T00:00:00').toLocaleDateString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric',
              })}
              <span className="ml-1.5 text-amber-500">×{d.typeCount}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

