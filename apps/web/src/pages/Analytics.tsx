import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart2, Search, X, CalendarDays } from 'lucide-react';
import { Layout, PageHeader } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { api } from '../api/client';
import type { AnalyticsRow } from '../types';

export function Analytics() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');

  // Build query params for date filter (server-side)
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['analytics', from, to],
    queryFn: () => api<AnalyticsRow[]>(`/analytics${qs ? `?${qs}` : ''}`),
  });

  // Client-side search across all visible text fields
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter(r =>
      r.username?.toLowerCase().includes(q) ||
      r.mobileNo?.toLowerCase().includes(q) ||
      r.city?.toLowerCase().includes(q) ||
      r.mediaName?.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const hasFilters = from || to || search;

  function clearFilters() {
    setFrom('');
    setTo('');
    setSearch('');
  }

  return (
    <Layout>
      <PageHeader
        title="Analytics"
        subtitle="Track downloads, shares, and activity across your team"
      />

      {/* Filter toolbar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Search</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Name, mobile, city, media…"
                className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* From date */}
          <div className="min-w-[150px]">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
              <CalendarDays size={12} /> From
            </label>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={e => setFrom(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* To date */}
          <div className="min-w-[150px]">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
              <CalendarDays size={12} /> To
            </label>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={e => setTo(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Clear */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
            >
              <X size={14} /> Clear
            </button>
          )}
        </div>

        {/* Result count */}
        {!isLoading && (
          <p className="text-xs text-gray-400 mt-3">
            {hasFilters
              ? `Showing ${filtered.length} of ${rows.length} result${rows.length !== 1 ? 's' : ''}`
              : `${rows.length} record${rows.length !== 1 ? 's' : ''} total`}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size={32} /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center">
          <BarChart2 size={48} className="mx-auto text-gray-300 mb-3" />
          {rows.length === 0 ? (
            <>
              <p className="text-gray-600 font-medium">No activity data yet</p>
              <p className="text-sm text-gray-400 mt-1">Data will appear here as your team downloads and shares media</p>
            </>
          ) : (
            <>
              <p className="text-gray-600 font-medium">No results match your filters</p>
              <button onClick={clearFilters} className="mt-3 text-sm text-blue-600 hover:underline">Clear filters</button>
            </>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['#', 'Name', 'Mobile', 'City', 'Media', 'Uploaded', 'Img Shared', 'Img DL', 'Vid Shared', 'Vid DL', 'App Opened', 'Date'].map(col => (
                    <th key={col} className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3.5 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3.5 font-medium text-gray-900 whitespace-nowrap">{row.username}</td>
                    <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">{row.mobileNo}</td>
                    <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">{row.city ?? '—'}</td>
                    <td className="px-4 py-3.5 text-gray-900 whitespace-nowrap max-w-[140px] truncate">{row.mediaName}</td>
                    <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">{fmtDate(row.uploadedDate)}</td>
                    <td className="px-4 py-3.5 text-center font-semibold text-gray-700">{row.imageShared}</td>
                    <td className="px-4 py-3.5 text-center font-semibold text-gray-700">{row.imageDownloaded}</td>
                    <td className="px-4 py-3.5 text-center font-semibold text-gray-700">{row.videoShared}</td>
                    <td className="px-4 py-3.5 text-center font-semibold text-gray-700">{row.videoDownloaded}</td>
                    <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">{row.appOpenedDate ? fmtDate(row.appOpenedDate) : '—'}</td>
                    <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap">{fmtDate(row.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
}

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
