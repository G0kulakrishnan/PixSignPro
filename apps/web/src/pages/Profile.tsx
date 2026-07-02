import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Camera, Lock, Check, X } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { api, getToken } from '../api/client';
import type { Profile as ProfileType } from '../types';

export function Profile() {
  const toast = useToast();
  const qc = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<ProfileType>>({});
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const picRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api<ProfileType>('/profile'),
  });

  function startEdit() {
    setForm({ ...profile });
    setEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: form.name,
          agencyName: form.agencyName || undefined,
          city: form.city || undefined,
          youtube: form.youtube || undefined,
          website: form.website || undefined,
          instagram: form.instagram || undefined,
          optional1: form.optional1 || undefined,
          optional2: form.optional2 || undefined,
        }),
      });
      qc.invalidateQueries({ queryKey: ['profile'] });
      toast('success', 'Profile updated');
      setEditing(false);
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePwd(e: React.FormEvent) {
    e.preventDefault();
    if (pwd.next !== pwd.confirm) {
      toast('error', 'New passwords do not match');
      return;
    }
    setSaving(true);
    try {
      await api('/profile/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: pwd.current, newPassword: pwd.next }),
      });
      toast('success', 'Password changed successfully');
      setChangingPwd(false);
      setPwd({ current: '', next: '', confirm: '' });
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Could not change password');
    } finally {
      setSaving(false);
    }
  }

  async function uploadPic(file: File, endpoint: 'picture' | 'logo') {
    const fd = new FormData();
    fd.append('file', file);
    try {
      await api(`/profile/${endpoint}`, { method: 'POST', body: fd });
      qc.invalidateQueries({ queryKey: ['profile'] });
      toast('success', endpoint === 'picture' ? 'Profile photo updated' : 'Company logo updated');
    } catch {
      toast('error', 'Could not upload photo');
    }
  }

  if (isLoading) return <Layout><div className="flex justify-center py-16"><Spinner size={32} /></div></Layout>;
  if (!profile) return null;

  const p = editing ? form : profile;

  return (
    <Layout>
      <div className="py-4 space-y-4">
        {/* Profile photos */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-blue-100 overflow-hidden border-2 border-blue-200 flex items-center justify-center">
                {profile.profilePicUrl ? (
                  <AuthImg url={profile.profilePicUrl} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-bold text-blue-600">{profile.name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <button
                onClick={() => picRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center shadow"
              >
                <Camera size={13} />
              </button>
              <input ref={picRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadPic(e.target.files[0], 'picture')} />
            </div>

            <div>
              <p className="font-bold text-gray-900">{profile.name}</p>
              <p className="text-sm text-gray-500">{profile.mobileNo}</p>
              <p className="text-xs text-blue-600 font-medium capitalize mt-0.5">{profile.role.replace('_', ' ')}</p>
            </div>

            {!editing && (
              <button onClick={startEdit} className="ml-auto flex items-center gap-1.5 text-sm text-blue-600 font-medium border border-blue-200 px-3 py-1.5 rounded-xl hover:bg-blue-50">
                <Pencil size={14} /> Edit
              </button>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100">
            <label className="block text-xs font-semibold text-gray-500 mb-2">Company Logo</label>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl bg-gray-100 overflow-hidden border border-gray-200 flex items-center justify-center">
                {profile.companyLogoUrl
                  ? <AuthImg url={profile.companyLogoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                  : <span className="text-xs text-gray-400">No logo</span>
                }
              </div>
              <button
                onClick={() => logoRef.current?.click()}
                className="text-sm text-blue-600 font-medium border border-blue-200 px-3 py-1.5 rounded-xl hover:bg-blue-50"
              >
                Change logo
              </button>
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadPic(e.target.files[0], 'logo')} />
            </div>
          </div>
        </div>

        {/* Profile Fields */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <form onSubmit={handleSave}>
            <div className="grid grid-cols-1 gap-4">
              <PF label="Name" value={p.name ?? ''} editing={editing} onChange={v => setForm(f => ({ ...f, name: v }))} required />
              <PF label="Phone Number" value={profile.mobileNo} editing={false} readOnly />
              <PF label="Agency Name" value={p.agencyName ?? ''} editing={editing} onChange={v => setForm(f => ({ ...f, agencyName: v }))} />
              <PF label="City" value={p.city ?? ''} editing={editing} onChange={v => setForm(f => ({ ...f, city: v }))} />
              <PF label="YouTube Channel" value={p.youtube ?? ''} editing={editing} onChange={v => setForm(f => ({ ...f, youtube: v }))} placeholder="@yourchannel" />
              <PF label="Website Link" value={p.website ?? ''} editing={editing} onChange={v => setForm(f => ({ ...f, website: v }))} placeholder="https://yoursite.com" />
              <PF label="Instagram" value={p.instagram ?? ''} editing={editing} onChange={v => setForm(f => ({ ...f, instagram: v }))} placeholder="@yourhandle" />
              <PF label="Optional Field 1" value={p.optional1 ?? ''} editing={editing} onChange={v => setForm(f => ({ ...f, optional1: v }))} />
              <PF label="Optional Field 2" value={p.optional2 ?? ''} editing={editing} onChange={v => setForm(f => ({ ...f, optional2: v }))} />
            </div>

            {editing && (
              <div className="flex gap-3 mt-5">
                <button type="button" onClick={() => setEditing(false)} className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5">
                  <X size={14} /> Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 transition">
                  {saving ? <Spinner size={14} /> : <Check size={14} />} Save
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Change Password */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Lock size={18} className="text-gray-500" />
              <h3 className="font-semibold text-gray-900 text-sm">Change Password</h3>
            </div>
            {!changingPwd && (
              <button onClick={() => setChangingPwd(true)} className="text-sm text-blue-600 font-medium border border-blue-200 px-3 py-1.5 rounded-xl hover:bg-blue-50">
                Change
              </button>
            )}
          </div>

          {changingPwd && (
            <form onSubmit={handleChangePwd} className="space-y-3">
              <PF label="Current Password" type="password" value={pwd.current} editing onChange={v => setPwd(p => ({ ...p, current: v }))} required />
              <PF label="New Password" type="password" value={pwd.next} editing onChange={v => setPwd(p => ({ ...p, next: v }))} required placeholder="Minimum 6 characters" />
              <PF label="Confirm New Password" type="password" value={pwd.confirm} editing onChange={v => setPwd(p => ({ ...p, confirm: v }))} required />
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setChangingPwd(false)} className="flex-1 border border-gray-300 rounded-xl py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition">
                  {saving ? <Spinner size={14} /> : 'Update Password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </Layout>
  );
}

function PF({
  label, value, editing, onChange, readOnly, required, type = 'text', placeholder,
}: {
  label: string; value: string; editing: boolean; onChange?: (v: string) => void;
  readOnly?: boolean; required?: boolean; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
      {editing && !readOnly ? (
        <input
          type={type}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          required={required}
          placeholder={placeholder}
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      ) : (
        <p className={`text-sm py-2 ${value ? 'text-gray-900' : 'text-gray-400 italic'}`}>
          {value || 'Not set'}
        </p>
      )}
    </div>
  );
}

function AuthImg({ url, alt, className }: { url: string; alt: string; className: string }) {
  const token = getToken();
  const [src, setSrc] = useState<string | null>(null);

  useState(() => {
    fetch(url.startsWith('/') ? url : `/${url}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(r => r.ok ? r.blob() : null)
      .then(blob => { if (blob) setSrc(URL.createObjectURL(blob)); })
      .catch(() => {});
  });

  if (!src) return null;
  return <img src={src} alt={alt} className={className} />;
}
