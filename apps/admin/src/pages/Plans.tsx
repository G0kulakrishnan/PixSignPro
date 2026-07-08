import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, PowerOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { ConfirmModal } from '../components/ConfirmModal';
import { useToast } from '../components/Toast';
import { api } from '../api/client';
import type { SubscriptionPlan } from '../types';

export function Plans() {
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [deactivateTarget, setDeactivateTarget] = useState<SubscriptionPlan | null>(null);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => api<SubscriptionPlan[]>('/admin/plans'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api(`/admin/plans/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] });
      toast('success', 'Plan deactivated');
      setDeactivateTarget(null);
    },
    onError: (e: Error) => toast('error', e.message),
  });

  return (
    <Layout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Subscription Plans</h1>
          <Link to="/plans/new" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
            <Plus size={16} /> New Plan
          </Link>
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
                    <button onClick={() => navigate(`/plans/${p.id}/edit`)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                      <Pencil size={14} />
                    </button>
                    {p.isActive && (
                      <button onClick={() => setDeactivateTarget(p)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
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
                  <p>👥 {p.maxUsers < 0 ? 'Unlimited users' : `Up to ${p.maxUsers} users`}</p>
                  <p>🖼️ {p.maxImages < 0 ? 'Unlimited images' : `${p.maxImages} images`}</p>
                  <p>🎬 {p.maxVideos < 0 ? 'Unlimited videos' : `${p.maxVideos} videos`}</p>
                  <p>💾 {p.maxStorageMb < 0 ? 'Unlimited storage' : (p.maxStorageMb >= 1024 ? `${p.maxStorageMb / 1024} GB` : `${p.maxStorageMb} MB`) + ' storage'}</p>
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

      {deactivateTarget && (
        <ConfirmModal
          title="Deactivate Plan"
          message={`Deactivate "${deactivateTarget.name}"? Existing businesses won't be affected but new ones can't be assigned this plan.`}
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
