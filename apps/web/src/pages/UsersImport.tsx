import { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { ArrowLeft, Download, UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { Layout, PageHeader } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { api } from '../api/client';

// One parsed staff row from the sheet, plus a client-side validation note.
interface ParsedRow {
  row: number;          // 1-based position in the file (data rows only)
  name: string;
  mobileNo: string;
  password: string;
  city: string;
  expiry: string;       // raw expiry text from the sheet
  error?: string;       // advisory client-side problem (server re-checks)
}

interface ImportResult {
  created: number;
  skippedCount: number;
  skipped: { row: number; mobileNo: string; reason: string }[];
}

// Accept common header spellings → our field names.
// Normalise headers by stripping everything but a–z/0–9 so "Mobile Number",
// "mobile_no" and "Expiry (YYYY-MM-DD)" all collapse to a comparable key.
function pick(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of Object.keys(obj)) {
    const norm = k.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (keys.some((key) => norm === key || norm.startsWith(key))) return String(obj[k] ?? '').trim();
  }
  return '';
}

function toIsoExpiry(raw: string): string | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return undefined;
  // Normalise to end-of-day UTC, matching the single-create form.
  return new Date(`${d.toISOString().slice(0, 10)}T23:59:59.999Z`).toISOString();
}

export function UsersImport() {
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'Mobile Number', 'Password', 'City', 'Expiry (YYYY-MM-DD)'],
      ['Ramesh Kumar', '9876543210', 'staff123', 'Madurai', ''],
      ['Priya S', '9876500011', 'welcome1', 'Chennai', '2026-12-31'],
    ]);
    ws['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Staff');
    XLSX.writeFile(wb, 'staff_import_template.xlsx');
  }

  function handleFile(file: File) {
    setResult(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: '' });
        const seen = new Set<string>();
        const parsed: ParsedRow[] = json.map((r, i) => {
          const name = pick(r, ['name', 'fullname', 'staffname']);
          const mobileNo = pick(r, ['mobilenumber', 'mobile', 'mobileno', 'phone', 'phonenumber', 'number']);
          const password = pick(r, ['password', 'pass', 'pwd']);
          const city = pick(r, ['city', 'town']);
          const expiry = pick(r, ['expiry', 'expires', 'expiresat']);
          let error: string | undefined;
          if (!name) error = 'Missing name';
          else if (mobileNo.length < 10) error = 'Invalid mobile number';
          else if (password.length < 6) error = 'Password too short (min 6)';
          else if (seen.has(mobileNo)) error = 'Duplicate in file';
          if (mobileNo) seen.add(mobileNo);
          return { row: i + 1, name, mobileNo, password, city, expiry, error };
        });
        if (!parsed.length) {
          toast('error', 'No rows found in the sheet');
          return;
        }
        setRows(parsed);
      } catch {
        toast('error', 'Could not read the file. Use the template format (.xlsx).');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  const validRows = rows.filter((r) => !r.error);

  async function handleImport() {
    if (!validRows.length) return;
    setImporting(true);
    try {
      const res = await api<ImportResult>('/users/bulk', {
        method: 'POST',
        body: JSON.stringify({
          users: validRows.map((r) => ({
            name: r.name,
            mobileNo: r.mobileNo,
            password: r.password,
            city: r.city || undefined,
            expiresAt: toIsoExpiry(r.expiry) ?? null,
          })),
        }),
      });
      setResult(res);
      qc.invalidateQueries({ queryKey: ['users'] });
      if (res.created > 0) toast('success', `${res.created} staff imported`);
      if (res.created === 0) toast('error', 'No staff were imported');
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setRows([]);
    setFileName('');
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <Layout>
      <PageHeader title="Import Staff" subtitle="Bulk-create staff accounts from an Excel sheet" />

      <Link to="/users" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-5">
        <ArrowLeft size={16} /> Back to Users
      </Link>

      {/* Result view */}
      {result ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-2xl">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle2 className="text-green-600" size={28} />
            <div>
              <p className="text-lg font-bold text-gray-900">{result.created} staff imported</p>
              {result.skippedCount > 0 && (
                <p className="text-sm text-amber-600">{result.skippedCount} row{result.skippedCount > 1 ? 's' : ''} skipped</p>
              )}
            </div>
          </div>

          {result.skipped.length > 0 && (
            <div className="border border-amber-100 bg-amber-50/50 rounded-xl overflow-hidden mb-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-amber-50 text-amber-800">
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Row</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Mobile</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Reason skipped</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {result.skipped.map((s, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-gray-500">{s.row}</td>
                      <td className="px-4 py-2 text-gray-700">{s.mobileNo || '—'}</td>
                      <td className="px-4 py-2 text-gray-700">{s.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => navigate('/users')} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition">Done</button>
            <button onClick={reset} className="border border-gray-300 px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">Import another file</button>
          </div>
        </div>
      ) : (
        <>
          {/* Step 1: template + upload */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 max-w-2xl mb-5">
            <div className="flex flex-wrap items-center gap-3 mb-5">
              <button onClick={downloadTemplate} className="inline-flex items-center gap-2 border border-gray-300 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition">
                <Download size={16} /> Download template
              </button>
              <p className="text-sm text-gray-500">Columns: <strong>Name, Mobile Number, Password</strong> (required), City, Expiry (optional).</p>
            </div>

            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
              className="border-2 border-dashed border-gray-300 rounded-xl py-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition"
            >
              <UploadCloud className="mx-auto text-gray-400 mb-2" size={32} />
              {fileName ? (
                <p className="text-sm text-gray-700 flex items-center justify-center gap-2"><FileSpreadsheet size={16} /> {fileName}</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-700">Click to choose an Excel file, or drag it here</p>
                  <p className="text-xs text-gray-400 mt-0.5">.xlsx, .xls or .csv</p>
                </>
              )}
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          </div>

          {/* Step 2: preview */}
          {rows.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden max-w-3xl">
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-800">
                  {validRows.length} ready · {rows.length - validRows.length} with issues
                </p>
                <button onClick={reset} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Mobile</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">City</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((r) => (
                      <tr key={r.row} className={r.error ? 'bg-amber-50/40' : ''}>
                        <td className="px-4 py-2 text-gray-400">{r.row}</td>
                        <td className="px-4 py-2 font-medium text-gray-900">{r.name || <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-2 text-gray-600">{r.mobileNo || '—'}</td>
                        <td className="px-4 py-2 text-gray-500 hidden sm:table-cell">{r.city || '—'}</td>
                        <td className="px-4 py-2">
                          {r.error ? (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700"><AlertTriangle size={13} /> {r.error}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-green-700"><CheckCircle2 size={13} /> Ready</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-3">
                <button
                  onClick={handleImport}
                  disabled={importing || validRows.length === 0}
                  className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition"
                >
                  {importing ? <><Spinner size={14} /> Importing…</> : `Import ${validRows.length} staff`}
                </button>
                <p className="text-xs text-gray-400">Rows with issues are skipped. Duplicates are re-checked on the server.</p>
              </div>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
