import { useQuery } from '@tanstack/react-query';
import { BarChart2 } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { api } from '../api/client';
import type { AnalyticsRow } from '../types';

export function Analytics() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => api<AnalyticsRow[]>('/analytics'),
  });

  return (
    <Layout>
      <div className="py-4">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Analytics</h2>

        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner size={32} /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16">
            <BarChart2 size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No activity data yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  {['#', 'Name', 'Mobile', 'City', 'Media', 'Uploaded', 'Img Shared', 'Img Downloaded', 'Vid Shared', 'Vid Downloaded', 'App Opened', 'Date'].map(col => (
                    <th key={col} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 whitespace-nowrap border-b border-gray-200">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{row.sNo}</td>
                    <td className="px-3 py-2.5 font-medium text-gray-900 whitespace-nowrap">{row.username}</td>
                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{row.mobileNo}</td>
                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{row.city ?? '—'}</td>
                    <td className="px-3 py-2.5 text-gray-900 whitespace-nowrap max-w-[140px] truncate">{row.mediaName}</td>
                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(row.uploadedDate)}</td>
                    <td className="px-3 py-2.5 text-center font-medium">{row.imageShared}</td>
                    <td className="px-3 py-2.5 text-center font-medium">{row.imageDownloaded}</td>
                    <td className="px-3 py-2.5 text-center font-medium">{row.videoShared}</td>
                    <td className="px-3 py-2.5 text-center font-medium">{row.videoDownloaded}</td>
                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{row.appOpenedDate ? fmtDate(row.appOpenedDate) : '—'}</td>
                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(row.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
