import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Pencil, Trash2, KeyRound, ShieldCheck, UserCircle2 } from 'lucide-react';
import { Layout } from '../components/Layout';
import { ConfirmModal } from '../components/ConfirmModal';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { api } from '../api/client';
import type { User, Role } from '../types';

const ROLE_LABELS: Record<Role, string> = {
  business_admin: 'Admin',
  media_admin: 'Media Admin',
  staff: 'Staff',
};

const ROLE_COLORS: Record<Role, string> = {
  business_admin: 'bg-blue-100 text-blue-700',
  media_admin: 'bg-purple-100 text-purple-700',
  staff: 'bg-gray-100 text-gray-600',
};

interface UserForm {
  name: string;
  mobileNo: string;
  role: Role;
  password: string;
  city: string;
}

const EMPTY_FORM: UserForm = { name: '', mobileNo: '', role: 'staff', password: '', city: '' };

export function Users() {
  const toast = useToast();
  const qc = useQueryClient();

  const [modal, setModal] = useState<null | 'create' | 'edit' | 'resetPwd' | 'delete'>(null);
  const [selected, setSelected] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [newPwd, setNewPwd] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api<User[]>('/users'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast('success', 'User removed');
      setModal(null);
    },
    onError: (e: Error) => toast('error', e.message || 'Could not delete user'),
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setModal('create');
  }

  function openEdit(u: User) {
    setSelected(u);
    setForm({ name: u.name, mobileNo: u.mobileNo, role: u.role, password: '', city: u.city ?? '' });
    setModal('edit');
  }

  function openResetPwd(u: User) {
    setSelected(u);
    setNewPwd('');
    setModal('resetPwd');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          mobileNo: form.mobileNo,
          role: form.role,
          password: form.password,
          city: form.city || undefined,
        }),
      });
      qc.invalidateQueries({ queryKey: ['users'] });
      toast('success', 'User created');
      setModal(null);
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Could not create user');
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      await api(`/users/${selected.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: form.name, role: form.role, city: form.city || undefined }),
      });
      qc.invalidateQueries({ queryKey: ['users'] });
      toast('success', 'User updated');
      setModal(null);
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Could not update user');
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPwd(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      await api(`/users/${selected.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: newPwd }),
      });
      toast('success', 'Password reset successfully');
      setModal(null);
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Could not reset password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <div className="py-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Users</h2>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium text-sm transition"
          >
            <UserPlus size={16} /> Add User
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner size={32} /></div>
        ) : users.length === 0 ? (
          <div className="text-center py-16">
            <UserCircle2 size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No users yet. Add one to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0 text-blue-700 font-bold text-sm">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm">{u.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role]}`}>
                        {ROLE_LABELS[u.role]}
                      </span>
                      {!u.isActive && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Inactive</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{u.mobileNo}</p>
                    {u.city && <p className="text-xs text-gray-400">{u.city}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openResetPwd(u)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Reset password">
                      <KeyRound size={16} />
                    </button>
                    <button onClick={() => openEdit(u)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Edit">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => { setSelected(u); setModal('delete'); }} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {modal === 'create' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-5">Add New User</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <Field label="Full Name"><input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className={inp} placeholder="John Doe" /></Field>
              <Field label="Phone Number"><input type="tel" value={form.mobileNo} onChange={e => setForm(f => ({ ...f, mobileNo: e.target.value }))} required className={inp} placeholder="9999999999" /></Field>
              <Field label="Password"><input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={6} className={inp} placeholder="Minimum 6 characters" /></Field>
              <Field label="Role">
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as Role }))} className={inp}>
                  <option value="staff">Staff (can download only)</option>
                  <option value="media_admin">Media Admin (upload & delete)</option>
                  <option value="business_admin">Admin (full control)</option>
                </select>
              </Field>
              <Field label="City (optional)"><input type="text" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className={inp} placeholder="Chennai" /></Field>
              <ModalButtons onCancel={() => setModal(null)} saving={saving} label="Create User" />
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {modal === 'edit' && selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-5">Edit User</h3>
            <form onSubmit={handleEdit} className="space-y-4">
              <Field label="Full Name"><input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className={inp} /></Field>
              <Field label="Role">
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as Role }))} className={inp}>
                  <option value="staff">Staff (can download only)</option>
                  <option value="media_admin">Media Admin (upload & delete)</option>
                  <option value="business_admin">Admin (full control)</option>
                </select>
              </Field>
              <Field label="City (optional)"><input type="text" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className={inp} /></Field>
              <p className="text-xs text-gray-500 flex items-center gap-1"><ShieldCheck size={12} /> Phone number cannot be changed. Use Reset Password for password changes.</p>
              <ModalButtons onCancel={() => setModal(null)} saving={saving} label="Save Changes" />
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {modal === 'resetPwd' && selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Reset Password</h3>
            <p className="text-sm text-gray-500 mb-5">Setting a new password for <strong>{selected.name}</strong></p>
            <form onSubmit={handleResetPwd} className="space-y-4">
              <Field label="New Password">
                <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} required minLength={6} className={inp} placeholder="Minimum 6 characters" />
              </Field>
              <ModalButtons onCancel={() => setModal(null)} saving={saving} label="Reset Password" />
            </form>
          </div>
        </div>
      )}

      {modal === 'delete' && selected && (
        <ConfirmModal
          title="Remove User"
          message={`Are you sure you want to remove ${selected.name}? They will no longer be able to log in.`}
          confirmLabel="Yes, remove"
          onConfirm={() => deleteMutation.mutate(selected.id)}
          onCancel={() => setModal(null)}
          loading={deleteMutation.isPending}
        />
      )}
    </Layout>
  );
}

const inp = 'w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function ModalButtons({ onCancel, saving, label }: { onCancel: () => void; saving: boolean; label: string }) {
  return (
    <div className="flex gap-3 pt-1">
      <button type="button" onClick={onCancel} className="flex-1 border border-gray-300 rounded-xl py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
      <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl py-3 text-sm font-semibold transition">
        {saving ? <><Spinner size={14} /> Saving…</> : label}
      </button>
    </div>
  );
}
