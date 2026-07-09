import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { api } from '../api/client';
import type { AdminUserRow, Business } from '../types';

const ROLE_LABEL: Record<string, string> = {
  business_admin: 'Business Admin',
  media_admin: 'Media Admin',
  staff: 'Staff',
  user_full_admin: 'User Admin',
  user_creation_admin: 'User Creator',
};

interface FormState {
  businessId: string;
  name: string;
  mobileNo: string;
  password: string;
  role: string;
  city: string;
  agencyName: string;
  isActive: boolean;
  expiresAt: string; // yyyy-mm-dd, or ''
}

const EMPTY: FormState = {
  businessId: '', name: '', mobileNo: '', password: '', role: 'staff',
  city: '', agencyName: '', isActive: true, expiresAt: '',
};

export function UserForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>(EMPTY);

  const { data: businesses = [] } = useQuery({
    queryKey: ['admin', 'businesses'],
    queryFn: () => api<Business[]>('/admin/businesses'),
  });

  const { data: user, isLoading } = useQuery({
    queryKey: ['admin', 'users', id],
    queryFn: () => api<AdminUserRow>(`/admin/users/${id}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (user) {
      setForm({
        businessId: user.business.id, name: user.name, mobileNo: user.mobileNo, password: '',
        role: user.role, city: user.city ?? '', agencyName: user.agencyName ?? '',
        isActive: user.isActive, expiresAt: user.expiresAt ? user.expiresAt.slice(0, 10) : '',
      });
    }
  }, [user]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const expiresAt = form.expiresAt ? new Date(`${form.expiresAt}T23:59:59.999Z`).toISOString() : null;
      if (isEdit) {
        const body: Record<string, unknown> = {
          name: form.name, mobileNo: form.mobileNo, role: form.role,
          city: form.city || undefined, agencyName: form.agencyName || undefined,
          isActive: form.isActive, expiresAt,
        };
        if (form.password) body.password = form.password;
        return api(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      }
      return api('/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          businessId: form.businessId, name: form.name, mobileNo: form.mobileNo,
          password: form.password, role: form.role,
          city: form.city || undefined, agencyName: form.agencyName || undefined, expiresAt,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast('success', isEdit ? 'User updated' : 'User created');
      navigate('/users');
    },
    onError: (e: unknown) => toast('error', e instanceof Error ? e.message : 'Could not save user'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    saveMutation.mutate();
  }

  const saving = saveMutation.isPending;

  if (isEdit && isLoading) return <Layout><div className="flex justify-center py-16"><Spinner /></div></Layout>;
  if (isEdit && !user) return <Layout><div className="p-8 text-gray-500">User not found.</div></Layout>;

  return (
    <Layout>
      <div className="p-8 max-w-lg">
        <Link to="/users" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6">
          <ArrowLeft size={16} /> Back to Users
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-6">{isEdit ? 'Edit User' : 'New User'}</h1>

        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
          <AF label="Business">
            {isEdit ? (
              <p className="text-sm text-gray-700 py-2">{user?.business.name}</p>
            ) : (
              <select required value={form.businessId} onChange={e => setForm(f => ({ ...f, businessId: e.target.value }))} className={inp}>
                <option value="">— Select business —</option>
                {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
          </AF>

          <AF label="Name"><input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inp} /></AF>
          <AF label="Mobile Number"><input type="text" required minLength={10} maxLength={15} value={form.mobileNo} onChange={e => setForm(f => ({ ...f, mobileNo: e.target.value }))} className={inp} /></AF>
          <AF label={isEdit ? 'New Password (leave blank to keep current)' : 'Password'}>
            <input type="text" required={!isEdit} minLength={6} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={isEdit ? '••••••' : ''} className={inp} />
          </AF>

          <AF label="Role">
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className={inp}>
              {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </AF>

          <div className="grid grid-cols-2 gap-3">
            <AF label="City"><input type="text" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className={inp} /></AF>
            <AF label="Agency Name"><input type="text" value={form.agencyName} onChange={e => setForm(f => ({ ...f, agencyName: e.target.value }))} className={inp} /></AF>
          </div>

          <AF label="Expiry Date (optional)">
            <input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} className={inp} />
          </AF>

          {isEdit && (
            <div className="flex items-center gap-2 pt-1">
              <input type="checkbox" id="isActive" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
              <label htmlFor="isActive" className="text-sm text-gray-700">User is active</label>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => navigate('/users')} className="border border-gray-300 rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg px-6 py-2.5 text-sm font-semibold transition">
              {saving ? <Spinner size={14} /> : <Save size={14} />}{isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function AF({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}
