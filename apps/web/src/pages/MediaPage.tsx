import { useRef, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Download, Trash2, Clock, Image, Film } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Layout } from '../components/Layout';
import { ConfirmModal } from '../components/ConfirmModal';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { api, getToken } from '../api/client';
import type { MediaItem } from '../types';

interface Props { type: 'image' | 'video' }

function AuthImage({ mediaId }: { mediaId: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    let objectUrl = '';
    fetch(`/api/media/${mediaId}/preview`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => (r.ok ? r.blob() : null))
      .then(blob => {
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setSrc(objectUrl);
        }
      })
      .catch(() => {});
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [mediaId]);

  if (!src) return <div className="w-full h-full bg-gray-100 flex items-center justify-center"><Image size={24} className="text-gray-400" /></div>;
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

  const canUpload = user?.role !== 'staff';
  const canDelete = user?.role !== 'staff';
  const isAdmin = user?.role !== 'staff';

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['media', type],
    queryFn: () => api<MediaItem[]>(`/media?type=${type}`),
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
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFiles.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      uploadFiles.forEach(f => fd.append('files', f));
      if (uploadTitle.trim()) {
        fd.append('titles', JSON.stringify([uploadTitle.trim()]));
      }
      if (scheduledAt) {
        fd.append('scheduledPublishAt', new Date(scheduledAt).toISOString());
      }
      await api('/media/upload', { method: 'POST', body: fd });
      qc.invalidateQueries({ queryKey: ['media', type] });
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

  const title = type === 'image' ? 'Images' : 'Videos';
  const accept = type === 'image' ? 'image/*' : 'video/*';
  const Icon = type === 'image' ? Image : Film;

  return (
    <Layout>
      <div className="py-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          {canUpload && (
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium text-sm transition"
            >
              <Plus size={16} /> Upload
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner size={32} /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <Icon size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">No {title.toLowerCase()} yet</p>
            {canUpload && <p className="text-sm text-gray-400 mt-1">Tap Upload to add files</p>}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 p-3">
                  {type === 'image' ? (
                    <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-gray-100">
                      <AuthImage mediaId={item.id} />
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                      <Film size={24} className="text-purple-600" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{item.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(item.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                    {isAdmin && item.scheduledPublishAt && !item.published && (
                      <span className="inline-flex items-center gap-1 text-xs text-yellow-700 bg-yellow-50 rounded-full px-2 py-0.5 mt-1">
                        <Clock size={10} /> Scheduled
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleDownload(item)}
                      className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition"
                      aria-label="Download"
                    >
                      <Download size={18} />
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => setDeleteTarget(item)}
                        className="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-xl transition"
                        aria-label="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
                    file:mr-3 file:py-2 file:px-4
                    file:rounded-xl file:border-0
                    file:bg-blue-50 file:text-blue-700 file:font-medium
                    hover:file:bg-blue-100"
                />
                {uploadFiles.length > 0 && (
                  <p className="text-xs text-green-600 mt-1">{uploadFiles.length} file{uploadFiles.length > 1 ? 's' : ''} selected</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Title <span className="font-normal text-gray-400">(optional — auto-generated if blank)</span>
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
                  Schedule publish <span className="font-normal text-gray-400">(optional — leave blank to publish now)</span>
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={e => setScheduledAt(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
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
          message={`Are you sure you want to delete "${deleteTarget.title}"? This cannot be undone.`}
          confirmLabel="Yes, delete"
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteMutation.isPending}
        />
      )}
    </Layout>
  );
}
