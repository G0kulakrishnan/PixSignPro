import { useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, PowerOff } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { ConfirmModal } from '../components/ConfirmModal';
import { useToast } from '../components/Toast';
import { api } from '../api/client';
import type { SubscriptionPlan } from '../types';

interface PlanForm {
  name: string;
  price: number | '';
  currency: string;
  billingPeriod: 'monthly' | 'quarterly' | 'yearly';
  maxUsers: number | '';
  maxStorageMb: number | '';
  maxImages: number | '';
  maxVideos: number | '';
  isActive: boolean;
}

const EMPTY: PlanForm = { name: '', price: '', currency: 'INR', billingPeriod: 'monthly', maxUsers: '', maxStorageMb: '', maxImages: '', maxVideos: '', isActive: true };

export function Plans() {
  const toast = useToast();
  const qc = useQueryClient();

  const [modal, setModal] = useState<null | 'create' | 'edit' | 'deactivate'>(null);
  const [selected, setSelected] = useState<SubscriptionPlan | null>(null);
  const [form, setForm] = useState<PlanForm>(EMPTY);
  const [saving, setSaving] = useState(false);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => api<SubscriptionPlan[]>('/admin/plans'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api(`/admin/plans/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] });
      toast('success', 'Plan deactivated');
      setModal(null);
    },
    onError: (e: Error) => toast('error', e.message),
  });

  function openCreate() { setForm(EMPTY); setModal('create'); }
  function openEdit(p: SubscriptionPlan) {
    setSelected(p);
    setForm({ name: p.name, price: p.price, currency: p.currency, billingPeriod: p.billingPeriod, maxUsers: p.maxUsers, maxStorageMb: p.maxStorageMb, maxImages: p.maxImages, maxVideos: p.maxVideos, isActive: p.isActive });
    setModal('edit');
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...form, price: Number(form.price), maxUsers: Number(form.maxUsers), maxStorageMb: Number(form.maxStorageMb), maxImages: Number(form.maxImages), maxVideos: Number(form.maxVideos) };
      if (modal === 'create') {
        await api('/admin/plans', { method: 'POST', body: JSON.stringify(body) });
        toast('success', 'Plan created');
      } else if (modal === 'edit' && selected) {
        await api(`/admin/plans/${selected.id}`, { method: 'PUT', body: JSON.stringify(body) });
        toast('success', 'Plan updated');
      }
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] });
      setModal(null);
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Could not save plan');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Subscription Plans</h1>
          <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
            <Plus size={16} /> New Plan
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {plans.map(p => (
              <div key={p.id} className={`bg-white rounded-xl border shadow-sm p-5 ${!p.isActive ? 'opacity-60' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-gray-900">{p.name}</h3>
                    <p className="text-xs text-gray-500 capitalize">{p.billingPeriod}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(p)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                      <Pencil size={14} />
                    </button>
                    {p.isActive && (
                      <button onClick={() => { setSelected(p); setModal('deactivate'); }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                        <PowerOff size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-2xl font-bold text-blue-600 mb-3">
                  {p.currency} {p.price.toLocaleString()}
                  <span className="text-sm font-normal text-gray-500">/{p.billingPeriod === 'monthly' ? 'mo' : p.billingPeriod === 'yearly' ? 'yr' : 'qtr'}</span>
                </p>
                <div className="space-y-1 text-sm text-gray-600">
                  <p>👥 {p.maxUsers > 0 ? `Up to ${p.maxUsers} users` : 'Unlimited users'}</p>
                  <p>🖼️ {p.maxImages > 0 ? `${p.maxImages} images` : 'Unlimited images'}</p>
                  <p>🎬 {p.maxVideos > 0 ? `${p.maxVideos} videos` : 'Unlimited videos'}</p>
                  <p>💾 {p.maxStorageMb > 0 ? (p.maxStorageMb >= 1024 ? `${p.maxStorageMb / 1024} GB` : `${p.maxStorageMb} MB`) + ' storage' : 'Unlimited storage'}</p>
                </div>
                {!p.isActive && <p className="mt-3 text-xs text-red-600 font-medium">Deactivated</p>}
              </div>
            ))}
            {plans.length === 0 && (
              <div className="col-span-3 text-center py-16 text-gray-400">No plans yet. Create one to get started.</div>
            )}
          </div>
        )}
      </div>

      {(modal === 'create' || modal === 'edit') && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-5">{modal === 'create' ? 'New Plan' : 'Edit Plan'}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <AF label="Plan Name"><input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Starter" className={inp} /></AF>
              <div className="grid grid-cols-2 gap-3">
                <AF label="Price"><input type="number" required min={0} value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value === '' ? '' : Number(e.target.value) }))} placeholder="0" className={inp} /></AF>
                <AF label="Currency"><input type="text" required value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} placeholder="INR" className={inp} /></AF>
              </div>
              <AF label="Billing Period">
                <select value={form.billingPeriod} onChange={e => setForm(f => ({ ...f, billingPeriod: e.target.value as PlanForm['billingPeriod'] }))} className={inp}>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </AF>
              <p className="text-xs text-gray-400 -mb-1">Enter 0 for unlimited.</p>
              <div className="grid grid-cols-2 gap-3">
                <AF label="Max Users"><input type="number" required min={0} value={form.maxUsers} onChange={e => setForm(f => ({ ...f, maxUsers: e.target.value === '' ? '' : Number(e.target.value) }))} className={inp} /></AF>
                <AF label="Storage (MB)"><input type="number" required min={0} value={form.maxStorageMb} onChange={e => setForm(f => ({ ...f, maxStorageMb: e.target.value === '' ? '' : Number(e.target.value) }))} className={inp} /></AF>
                <AF label="Max Images"><input type="number" required min={0} value={form.maxImages} onChange={e => setForm(f => ({ ...f, maxImages: e.target.value === '' ? '' : Number(e.target.value) }))} className={inp} /></AF>
                <AF label="Max Videos"><input type="number" required min={0} value={form.maxVideos} onChange={e => setForm(f => ({ ...f, maxVideos: e.target.value === '' ? '' : Number(e.target.value) }))} className={inp} /></AF>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(null)} className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg py-2.5 text-sm font-semibold transition">
                  {saving ? <Spinner size={14} /> : null}{modal === 'create' ? 'Create' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === 'deactivate' && selected && (
        <ConfirmModal
          title="Deactivate Plan"
          message={`Deactivate "${selected.name}"? Existing businesses won't be affected but new ones can't be assigned this plan.`}
          confirmLabel="Deactivate"
          onConfirm={() => deactivateMutation.mutate(selected.id)}
          onCancel={() => setModal(null)}
          loading={deactivateMutation.isPending}
          danger
        />
      )}
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
