import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { api } from '../api/client';
import type { SubscriptionPlan } from '../types';

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

export function BusinessCreate() {
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [form, setForm] = useState<CreateForm>(EMPTY);

  const { data: plans = [] } = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => api<SubscriptionPlan[]>('/admin/plans'),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api('/admin/businesses', {
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
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'businesses'] });
      toast('success', 'Business created');
      navigate('/businesses');
    },
    onError: (e: unknown) => toast('error', e instanceof Error ? e.message : 'Could not create business'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate();
  }

  const f = (k: keyof CreateForm, v: string) => setForm(prev => ({ ...prev, [k]: v }));
  const saving = createMutation.isPending;

  return (
    <Layout>
      <div className="p-8 max-w-2xl">
        <Link to="/businesses" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6">
          <ArrowLeft size={16} /> Back to Businesses
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-6">Add Business</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            <button type="button" onClick={() => navigate('/businesses')} className="border border-gray-300 rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg px-6 py-2.5 text-sm font-semibold transition">
              {saving ? <Spinner size={14} /> : <Save size={14} />} Create Business
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3 shadow-sm">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}
