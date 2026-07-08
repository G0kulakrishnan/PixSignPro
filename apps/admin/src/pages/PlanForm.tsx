import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { api } from '../api/client';
import type { SubscriptionPlan } from '../types';

interface FormState {
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

const EMPTY: FormState = { name: '', price: '', currency: 'INR', billingPeriod: 'monthly', maxUsers: '', maxStorageMb: '', maxImages: '', maxVideos: '', isActive: true };

export function PlanForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>(EMPTY);

  // For edit, pull the plan from the cached list (or fetch it if navigated directly).
  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => api<SubscriptionPlan[]>('/admin/plans'),
    enabled: isEdit,
  });

  const plan = isEdit ? plans.find(p => p.id === id) : undefined;

  useEffect(() => {
    if (plan) {
      setForm({
        name: plan.name, price: plan.price, currency: plan.currency, billingPeriod: plan.billingPeriod,
        maxUsers: plan.maxUsers, maxStorageMb: plan.maxStorageMb, maxImages: plan.maxImages, maxVideos: plan.maxVideos,
        isActive: plan.isActive,
      });
    }
  }, [plan]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        price: Number(form.price), maxUsers: Number(form.maxUsers), maxStorageMb: Number(form.maxStorageMb),
        maxImages: Number(form.maxImages), maxVideos: Number(form.maxVideos),
      };
      return isEdit
        ? api(`/admin/plans/${id}`, { method: 'PUT', body: JSON.stringify(body) })
        : api('/admin/plans', { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] });
      toast('success', isEdit ? 'Plan updated' : 'Plan created');
      navigate('/plans');
    },
    onError: (e: unknown) => toast('error', e instanceof Error ? e.message : 'Could not save plan'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    saveMutation.mutate();
  }

  const saving = saveMutation.isPending;

  if (isEdit && isLoading) return <Layout><div className="flex justify-center py-16"><Spinner /></div></Layout>;
  if (isEdit && !plan) return <Layout><div className="p-8 text-gray-500">Plan not found.</div></Layout>;

  return (
    <Layout>
      <div className="p-8 max-w-lg">
        <Link to="/plans" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6">
          <ArrowLeft size={16} /> Back to Plans
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-6">{isEdit ? 'Edit Plan' : 'New Plan'}</h1>

        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-4">
          <AF label="Plan Name"><input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Starter" className={inp} /></AF>
          <div className="grid grid-cols-2 gap-3">
            <AF label="Price"><input type="number" required min={0} value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value === '' ? '' : Number(e.target.value) }))} placeholder="0" className={inp} /></AF>
            <AF label="Currency"><input type="text" required value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} placeholder="INR" className={inp} /></AF>
          </div>
          <AF label="Billing Period">
            <select value={form.billingPeriod} onChange={e => setForm(f => ({ ...f, billingPeriod: e.target.value as FormState['billingPeriod'] }))} className={inp}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </AF>
          <p className="text-xs text-gray-400 -mb-1">Enter -1 for unlimited.</p>
          <div className="grid grid-cols-2 gap-3">
            <AF label="Max Users"><input type="number" required min={-1} value={form.maxUsers} onChange={e => setForm(f => ({ ...f, maxUsers: e.target.value === '' ? '' : Number(e.target.value) }))} className={inp} /></AF>
            <AF label="Storage (MB)"><input type="number" required min={-1} value={form.maxStorageMb} onChange={e => setForm(f => ({ ...f, maxStorageMb: e.target.value === '' ? '' : Number(e.target.value) }))} className={inp} /></AF>
            <AF label="Max Images"><input type="number" required min={-1} value={form.maxImages} onChange={e => setForm(f => ({ ...f, maxImages: e.target.value === '' ? '' : Number(e.target.value) }))} className={inp} /></AF>
            <AF label="Max Videos"><input type="number" required min={-1} value={form.maxVideos} onChange={e => setForm(f => ({ ...f, maxVideos: e.target.value === '' ? '' : Number(e.target.value) }))} className={inp} /></AF>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => navigate('/plans')} className="border border-gray-300 rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
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
