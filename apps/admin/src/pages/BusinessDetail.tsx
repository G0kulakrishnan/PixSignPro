import { useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Save, X } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { api } from '../api/client';
import type { BusinessDetail as BizDetail, SubscriptionPlan } from '../types';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  expired: 'bg-red-100 text-red-700',
  suspended: 'bg-yellow-100 text-yellow-700',
};

const ROLE_LABELS: Record<string, string> = {
  business_admin: 'Admin',
  media_admin: 'Media Admin',
  staff: 'Staff',
};

interface EditForm {
  name: string;
  agencyName: string;
  city: string;
  website: string;
  planId: string;
  subscriptionStatus: 'active' | 'expired' | 'suspended';
  subscriptionEnd: string;
  isActive: boolean;
}

export function BusinessDetail() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: biz, isLoading } = useQuery({
    queryKey: ['admin', 'businesses', id],
    queryFn: () => api<BizDetail>(`/admin/businesses/${id}`),
    enabled: !!id,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => api<SubscriptionPlan[]>('/admin/plans'),
  });

  function startEdit() {
    if (!biz) return;
    setForm({
      name: biz.name,
      agencyName: biz.agencyName ?? '',
      city: biz.city ?? '',
      website: biz.website ?? '',
      planId: biz.planId ?? '',
      subscriptionStatus: biz.subscriptionStatus,
      subscriptionEnd: biz.subscriptionEnd ? biz.subscriptionEnd.split('T')[0] : '',
      isActive: biz.isActive,
    });
    setEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !id) return;
    setSaving(true);
    try {
      await api(`/admin/businesses/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: form.name,
          agencyName: form.agencyName || undefined,
          city: form.city || undefined,
          website: form.website || undefined,
          planId: form.planId || undefined,
          subscriptionStatus: form.subscriptionStatus,
          subscriptionEnd: form.subscriptionEnd ? new Date(form.subscriptionEnd).toISOString() : undefined,
          isActive: form.isActive,
        }),
      });
      qc.invalidateQueries({ queryKey: ['admin', 'businesses', id] });
      qc.invalidateQueries({ queryKey: ['admin', 'businesses'] });
      toast('success', 'Business updated');
      setEditing(false);
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <Layout><div className="flex justify-center py-16"><Spinner /></div></Layout>;
  if (!biz) return <Layout><div className="p-8 text-gray-500">Business not found.</div></Layout>;

  const f = form ?? {} as EditForm;

  return (
    <Layout>
      <div className="p-8 max-w-4xl">
        <Link to="/businesses" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6">
          <ArrowLeft size={16} /> Back to Businesses
        </Link>

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{biz.name}</h1>
            {biz.city && <p className="text-gray-500 text-sm mt-0.5">{biz.city}</p>}
          </div>
          <div className="flex gap-2">
            {!editing ? (
              <button onClick={startEdit} className="flex items-center gap-2 border border-gray-300 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                <Pencil size={14} /> Edit
              </button>
            ) : (
              <>
                <button type="button" onClick={() => setEditing(false)} className="flex items-center gap-1.5 border border-gray-300 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50">
                  <X size={14} /> Cancel
                </button>
                <button form="edit-form" type="submit" disabled={saving} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition">
                  {saving ? <Spinner size={14} /> : <Save size={14} />} Save
                </button>
              </>
            )}
          </div>
        </div>

        <form id="edit-form" onSubmit={handleSave} className="space-y-4 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card title="Business Info">
              <BF label="Name" editing={editing} value={editing ? f.name : biz.name} onChange={v => setForm(p => p ? { ...p, name: v } : p)} />
              <BF label="Agency Name" editing={editing} value={editing ? f.agencyName : (biz.agencyName ?? '')} onChange={v => setForm(p => p ? { ...p, agencyName: v } : p)} />
              <BF label="City" editing={editing} value={editing ? f.city : (biz.city ?? '')} onChange={v => setForm(p => p ? { ...p, city: v } : p)} />
              <BF label="Website" editing={editing} value={editing ? f.website : (biz.website ?? '')} onChange={v => setForm(p => p ? { ...p, website: v } : p)} />
            </Card>

            <Card title="Subscription">
              {editing ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Plan</label>
                    <select value={f.planId} onChange={e => setForm(p => p ? { ...p, planId: e.target.value } : p)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— No plan —</option>
                      {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
                    <select value={f.subscriptionStatus} onChange={e => setForm(p => p ? { ...p, subscriptionStatus: e.target.value as EditForm['subscriptionStatus'] } : p)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="active">Active</option>
                      <option value="expired">Expired</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Subscription End</label>
                    <input type="date" value={f.subscriptionEnd} onChange={e => setForm(p => p ? { ...p, subscriptionEnd: e.target.value } : p)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="isActive" checked={f.isActive} onChange={e => setForm(p => p ? { ...p, isActive: e.target.checked } : p)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                    <label htmlFor="isActive" className="text-sm text-gray-700">Business is active</label>
                  </div>
                </>
              ) : (
                <>
                  <BF label="Plan" editing={false} value={biz.plan?.name ?? 'None'} />
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">Status</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[biz.subscriptionStatus]}`}>{biz.subscriptionStatus}</span>
                  </div>
                  <BF label="Subscription End" editing={false} value={biz.subscriptionEnd ? fmtDate(biz.subscriptionEnd) : 'No expiry set'} />
                  <BF label="Active" editing={false} value={biz.isActive ? 'Yes' : 'No'} />
                </>
              )}
            </Card>
          </div>
        </form>

        {/* Users table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Users ({biz.users.length})</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <Th>Name</Th>
                <Th>Mobile</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Joined</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {biz.users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                  <td className="px-4 py-3 text-gray-600">{u.mobileNo}</td>
                  <td className="px-4 py-3 text-gray-600">{ROLE_LABELS[u.role] ?? u.role}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(u.createdAt)}</td>
                </tr>
              ))}
              {biz.users.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-gray-400">No users</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide border-b border-gray-100 pb-2">{title}</h3>
      {children}
    </div>
  );
}

function BF({ label, value, editing, onChange }: { label: string; value: string; editing: boolean; onChange?: (v: string) => void }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
      {editing && onChange ? (
        <input type="text" value={value} onChange={e => onChange(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      ) : (
        <p className={`text-sm ${value ? 'text-gray-900' : 'text-gray-400 italic'}`}>{value || 'Not set'}</p>
      )}
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{children}</th>;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
