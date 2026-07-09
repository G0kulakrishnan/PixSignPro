import { useState, useMemo, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Search, X, CalendarClock, Plus, Trash2, SquarePen } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { ConfirmModal } from '../components/ConfirmModal';
import { useToast } from '../components/Toast';
import { api } from '../api/client';
import type { AdminUserRow } from '../types';

const ROLE_LABEL: Record<string, string> = {
  business_admin: 'Business Admin',
  media_admin: 'Media Admin',
  staff: 'Staff',
  user_full_admin: 'User Admin',
  user_creation_admin: 'User Creator',
};

export function Users() {
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<AdminUserRow | null>(null);
  const [expiryInput, setExpiryInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api<AdminUserRow[]>('/admin/users'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast('success', 'User deleted');
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast('error', e.message),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.trim().toLowerCase();
    return users.filter(u =>
      u.name.toLowerCase().includes(q) ||
      u.mobileNo.toLowerCase().includes(q) ||
      (u.city ?? '').toLowerCase().includes(q) ||
      u.business.name.toLowerCase().includes(q)
    );
  }, [users, search]);

  function openEdit(u: AdminUserRow) {
    setEdit(u);
    setExpiryInput(u.expiresAt ? u.expiresAt.slice(0, 10) : '');
  }

  async function saveExpiry() {
    if (!edit) return;
    setSaving(true);
    try {
      await api(`/admin/users/${edit.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expiresAt: expiryInput ? new Date(`${expiryInput}T23:59:59.999Z`).toISOString() : null,
        }),
      });
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast('success', 'User expiry updated');
      setEdit(null);
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Could not update expiry');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">All Users</h1>
            <p className="text-sm text-gray-500 mt-0.5">Every user across all businesses, with per-user expiry</p>
          </div>
          <Link to="/users/new" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
            <Plus size={16} /> Add User
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
          <div className="relative max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, mobile, city, business…"
              className="w-full pl-9 pr-9 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={15} />
              </button>
            )}
          </div>
          {!isLoading && (
            <p className="text-xs text-gray-400 mt-2.5">
              {search ? `Showing ${filtered.length} of ${users.length}` : `${users.length} user${users.length !== 1 ? 's' : ''} total`}
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['#', 'Name', 'Mobile', 'Business', 'Role', 'City', 'Status', 'User Expiry', ''].map(c => (
                      <Th key={c}>{c}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((u, i) => (
                    <tr key={u.id} className={`hover:bg-gray-50 ${u.status === 'inactive' ? 'opacity-70' : ''}`}>
                      <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{u.name}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{u.mobileNo}</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{u.business.name}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{ROLE_LABEL[u.role] ?? u.role}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{u.city ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {u.expiresAt ? (
                          <span className={u.expired ? 'text-red-600 font-medium' : 'text-gray-600'}>
                            {fmtDate(u.expiresAt)}{u.expired ? ' (expired)' : ''}
                          </span>
                        ) : (
                          <span className="text-gray-300">No expiry</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => navigate(`/users/${u.id}/edit`)}
                            title="Edit user"
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          >
                            <SquarePen size={14} />
                          </button>
                          <button
                            onClick={() => openEdit(u)}
                            title="Set expiry"
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          >
                            <CalendarClock size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(u)}
                            title="Delete user"
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={9} className="py-16 text-center text-gray-400">No users found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {edit && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
              <CalendarClock size={18} /> Set User Expiry
            </h2>
            <p className="text-sm text-gray-500 mb-4">{edit.name} · {edit.business.name}</p>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Expiry date</label>
            <input
              type="date"
              value={expiryInput}
              onChange={e => setExpiryInput(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1.5">Leave blank to remove the user-level expiry. After this date the user cannot log in.</p>
            <div className="flex gap-3 pt-4">
              <button onClick={() => setEdit(null)} className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={saveExpiry} disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg py-2.5 text-sm font-semibold transition">
                {saving ? <Spinner size={14} /> : null} Save
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete User"
          message={`Delete "${deleteTarget.name}" (${deleteTarget.business.name})? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteMutation.isPending}
          danger
        />
      )}
    </Layout>
  );
}

function Th({ children }: { children?: ReactNode }) {
  return <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{children}</th>;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
