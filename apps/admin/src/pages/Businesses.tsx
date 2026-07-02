import { useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Eye, PowerOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { ConfirmModal } from '../components/ConfirmModal';
import { useToast } from '../components/Toast';
import { api } from '../api/client';
import type { Business, SubscriptionPlan } from '../types';

interface CreateForm {
  name: string;
  agencyName: string;
  city: string;
  website: string;
  planId: string;
  subscriptionStatus: 'active' | 'expired' | 'suspended';
  subscriptionStart: string;
  subscriptionEnd: string;
  adminName: string;
  adminMobileNo: string;
  adminPassword: string;
}

const EMPTY: CreateForm = {
  name: '', agencyName: '', city: '', website: '', planId: '',
  subscriptionStatus: 'active', subscriptionStart: '', subscriptionEnd: '',
  adminName: '', adminMobileNo: '', adminPassword: '',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  expired: 'bg-red-100 text-red-700',
  suspended: 'bg-yellow-100 text-yellow-700',
};

export function Businesses() {
  const toast = useToast();
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<Business | null>(null);
  const [form, setForm] = useState<CreateForm>(EMPTY);
  const [saving, setSaving] = useState(false);

  const { data: businesses = [], isLoading } = useQuery({
    queryKey: ['admin', 'businesses'],
    queryFn: () => api<Business[]>('/admin/businesses'),
  });

  const { data: plans = [] } = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => api<SubscriptionPlan[]>('/admin/plans'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api(`/admin/businesses/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'businesses'] });
      toast('success', 'Business deactivated');
      setDeactivateTarget(null);
    },
    onError: (e: Error) => toast('error', e.message),
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/admin/businesses', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          agencyName: form.agencyName || undefined,
          city: form.city || undefined,
          website: form.website || undefined,
          planId: form.planId || undefined,
          subscriptionStatus: form.subscriptionStatus,
          subscriptionStart: form.subscriptionStart ? new Date(form.subscriptionStart).toISOString() : undefined,
          subscriptionEnd: form.subscriptionEnd ? new Date(form.subscriptionEnd).toISOString() : undefined,
          adminName: form.adminName,
          adminMobileNo: form.adminMobileNo,
          adminPassword: form.adminPassword,
        }),
      });
      qc.invalidateQueries({ queryKey: ['admin', 'businesses'] });
      toast('success', 'Business created');
      setShowCreate(false);
      setForm(EMPTY);
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Could not create business');
    } finally {
      setSaving(false);
    }
  }

  const f = (k: keyof CreateForm, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <Layout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Businesses</h1>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
            <Plus size={16} /> Add Business
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <Th>Business</Th>
                  <Th>Plan</Th>
                  <Th>Status</Th>
                  <Th>Sub. End</Th>
                  <Th>Users</Th>
                  <Th>Media</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {businesses.map(b => (
                  <tr key={b.id} className={`hover:bg-gray-50 ${!b.isActive ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{b.name}</p>
                      {b.city && <p className="text-xs text-gray-400">{b.city}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{b.plan?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[b.subscriptionStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                        {b.subscriptionStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{b.subscriptionEnd ? fmtDate(b.subscriptionEnd) : '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{b._count?.users ?? 0}</td>
                    <td className="px-4 py-3 text-gray-600">{b._count?.media ?? 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Link to={`/businesses/${b.id}`} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                          <Eye size={15} />
                        </Link>
                        {b.isActive && (
                          <button onClick={() => setDeactivateTarget(b)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                            <PowerOff size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {businesses.length === 0 && (
                  <tr><td colSpan={7} className="py-16 text-center text-gray-400">No businesses yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Business Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-lg my-4 p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-5">Add Business</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <Section title="Business Info">
                <AF label="Business Name"><input required type="text" value={form.name} onChange={e => f('name', e.target.value)} className={inp} placeholder="Acme Corp" /></AF>
                <div className="grid grid-cols-2 gap-3">
                  <AF label="Agency Name"><input type="text" value={form.agencyName} onChange={e => f('agencyName', e.target.value)} className={inp} /></AF>
                  <AF label="City"><input type="text" value={form.city} onChange={e => f('city', e.target.value)} className={inp} /></AF>
                </div>
                <AF label="Website"><input type="text" value={form.website} onChange={e => f('website', e.target.value)} className={inp} placeholder="https://..." /></AF>
              </Section>

              <Section title="Subscription">
                <AF label="Plan">
                  <select value={form.planId} onChange={e => f('planId', e.target.value)} className={inp}>
                    <option value="">— No plan —</option>
                    {plans.filter(p => p.isActive).map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.currency} {p.price}/{p.billingPeriod})</option>
                    ))}
                  </select>
                </AF>
                <div className="grid grid-cols-2 gap-3">
                  <AF label="Start Date"><input type="date" value={form.subscriptionStart} onChange={e => f('subscriptionStart', e.target.value)} className={inp} /></AF>
                  <AF label="End Date"><input type="date" value={form.subscriptionEnd} onChange={e => f('subscriptionEnd', e.target.value)} className={inp} /></AF>
                </div>
                <AF label="Status">
                  <select value={form.subscriptionStatus} onChange={e => f('subscriptionStatus', e.target.value as CreateForm['subscriptionStatus'])} className={inp}>
                    <option value="active">Active</option>
                    <option value="expired">Expired</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </AF>
              </Section>

              <Section title="First Admin Account">
                <AF label="Admin Name"><input required type="text" value={form.adminName} onChange={e => f('adminName', e.target.value)} className={inp} placeholder="Full name" /></AF>
                <AF label="Admin Mobile No."><input required type="tel" value={form.adminMobileNo} onChange={e => f('adminMobileNo', e.target.value)} className={inp} placeholder="9999999999" /></AF>
                <AF label="Admin Password"><input required type="password" value={form.adminPassword} onChange={e => f('adminPassword', e.target.value)} className={inp} placeholder="Min 6 characters" minLength={6} /></AF>
              </Section>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowCreate(false); setForm(EMPTY); }} className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg py-2.5 text-sm font-semibold transition">
                  {saving ? <Spinner size={14} /> : null} Create Business
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deactivateTarget && (
        <ConfirmModal
          title="Deactivate Business"
          message={`Deactivate "${deactivateTarget.name}"? All users will be locked out immediately.`}
          confirmLabel="Deactivate"
          onConfirm={() => deactivateMutation.mutate(deactivateTarget.id)}
          onCancel={() => setDeactivateTarget(null)}
          loading={deactivateMutation.isPending}
          danger
        />
      )}
    </Layout>
  );
}

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function Th({ children }: { children?: ReactNode }) {
  return <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{children}</th>;
}

function AF({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-3">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
