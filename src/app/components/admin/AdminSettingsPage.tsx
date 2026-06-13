import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router';
import { Lock, User, CheckCircle, XCircle, Eye, EyeOff, BarChart2, Plus, Trash2, Edit2, ToggleLeft, ToggleRight } from 'lucide-react';

interface AdminUser { sub: number; email: string; nama: string; role: string; }
interface PasswordForm { password_lama: string; password_baru: string; password_baru_konfirmasi: string; }
interface PixelConfig { id: number; label: string; pixel_id: string; is_active: number; events_enabled: string; created_at: string; }
interface TrackingSettings { ga4_measurement_id: string; gtm_container_id: string; search_console_verification: string; }
interface PixelFormState { mode: 'add' | 'edit'; id?: number; label: string; pixel_id: string; events: string[]; }
interface Msg { type: 'success' | 'error'; text: string; }

const ALL_EVENTS = ['PageView', 'ViewContent', 'Search', 'Contact', 'Lead'];

function MsgBox({ msg }: { msg: Msg | null }) {
  if (!msg) return null;
  return (
    <div className={`flex items-start gap-2 rounded-xl p-3 mb-4 text-sm ${msg.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
      {msg.type === 'success' ? <CheckCircle size={15} className="mt-0.5 flex-shrink-0" /> : <XCircle size={15} className="mt-0.5 flex-shrink-0" />}
      <span>{msg.text}</span>
    </div>
  );
}

export default function AdminSettingsPage() {
  const admin = useOutletContext<AdminUser | null>();

  // ── Password form state ──
  const [form, setForm] = useState<PasswordForm>({ password_lama: '', password_baru: '', password_baru_konfirmasi: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<Msg | null>(null);
  const [show, setShow] = useState({ lama: false, baru: false, konfirmasi: false });

  // ── Tracking state ──
  const [pixels, setPixels] = useState<PixelConfig[]>([]);
  const [pixelsLoading, setPixelsLoading] = useState(true);
  const [pixelMsg, setPixelMsg] = useState<Msg | null>(null);
  const [pixelForm, setPixelForm] = useState<PixelFormState | null>(null);
  const [savingPixel, setSavingPixel] = useState(false);

  const [tracking, setTracking] = useState<TrackingSettings>({ ga4_measurement_id: '', gtm_container_id: '', search_console_verification: '' });
  const [savingTracking, setSavingTracking] = useState(false);
  const [trackingMsg, setTrackingMsg] = useState<Msg | null>(null);

  // ── Load pixel configs + tracking settings ──
  useEffect(() => {
    Promise.all([
      fetch('/api/admin/pixel-configs', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/admin/settings/tracking', { credentials: 'include' }).then(r => r.json()),
    ]).then(([pRes, tRes]) => {
      if (pRes.success) setPixels(pRes.data?.pixels ?? []);
      if (tRes.success && tRes.data) {
        setTracking({
          ga4_measurement_id:          tRes.data.ga4_measurement_id          ?? '',
          gtm_container_id:            tRes.data.gtm_container_id            ?? '',
          search_console_verification: tRes.data.search_console_verification ?? '',
        });
      }
    }).catch(console.error).finally(() => setPixelsLoading(false));
  }, []);

  // ── Password handler ──
  const handleChangePw = (e: React.ChangeEvent<HTMLInputElement>) => { setForm(f => ({ ...f, [e.target.name]: e.target.value })); setPwMsg(null); };
  const toggleShow = (field: keyof typeof show) => setShow(s => ({ ...s, [field]: !s[field] }));

  const handleSubmitPw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password_baru !== form.password_baru_konfirmasi) { setPwMsg({ type: 'error', text: 'Password baru dan konfirmasi tidak cocok' }); return; }
    if (form.password_baru.length < 8) { setPwMsg({ type: 'error', text: 'Password baru minimal 8 karakter' }); return; }
    setPwLoading(true); setPwMsg(null);
    try {
      const res = await fetch('/api/admin/password', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (data.success) { setPwMsg({ type: 'success', text: data.data?.message ?? 'Password berhasil diubah' }); setForm({ password_lama: '', password_baru: '', password_baru_konfirmasi: '' }); }
      else setPwMsg({ type: 'error', text: data.error ?? 'Gagal mengubah password' });
    } catch { setPwMsg({ type: 'error', text: 'Koneksi ke server gagal' }); }
    finally { setPwLoading(false); }
  };

  // ── Pixel handlers ──
  const openAddPixel = () => setPixelForm({ mode: 'add', label: '', pixel_id: '', events: [...ALL_EVENTS] });
  const openEditPixel = (px: PixelConfig) => {
    let events: string[];
    try { events = JSON.parse(px.events_enabled); } catch { events = [...ALL_EVENTS]; }
    setPixelForm({ mode: 'edit', id: px.id, label: px.label, pixel_id: px.pixel_id, events });
  };

  const handleSavePixel = async () => {
    if (!pixelForm) return;
    const label = pixelForm.label.trim(); const pixel_id = pixelForm.pixel_id.trim();
    if (!label || !pixel_id) { setPixelMsg({ type: 'error', text: 'Label dan Pixel ID wajib diisi' }); return; }
    setSavingPixel(true); setPixelMsg(null);
    try {
      const isEdit = pixelForm.mode === 'edit';
      const url = isEdit ? `/api/admin/pixel-configs/${pixelForm.id}` : '/api/admin/pixel-configs';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label, pixel_id, events_enabled: pixelForm.events }) });
      const data = await res.json();
      if (data.success) {
        const saved: PixelConfig = data.data.pixel;
        setPixels(prev => isEdit ? prev.map(p => p.id === saved.id ? saved : p) : [...prev, saved]);
        setPixelForm(null);
        setPixelMsg({ type: 'success', text: isEdit ? 'Pixel diperbarui' : 'Pixel ditambahkan' });
      } else setPixelMsg({ type: 'error', text: data.error ?? 'Gagal menyimpan pixel' });
    } catch { setPixelMsg({ type: 'error', text: 'Koneksi gagal' }); }
    finally { setSavingPixel(false); }
  };

  const handleTogglePixel = async (px: PixelConfig) => {
    try {
      const res = await fetch(`/api/admin/pixel-configs/${px.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: px.is_active ? 0 : 1 }) });
      const data = await res.json();
      if (data.success) setPixels(prev => prev.map(p => p.id === px.id ? data.data.pixel : p));
    } catch { setPixelMsg({ type: 'error', text: 'Gagal mengubah status pixel' }); }
  };

  const handleDeletePixel = async (id: number) => {
    if (!window.confirm('Hapus pixel config ini?')) return;
    try {
      const res = await fetch(`/api/admin/pixel-configs/${id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) { setPixels(prev => prev.filter(p => p.id !== id)); setPixelMsg({ type: 'success', text: 'Pixel dihapus' }); }
      else setPixelMsg({ type: 'error', text: data.error ?? 'Gagal menghapus pixel' });
    } catch { setPixelMsg({ type: 'error', text: 'Koneksi gagal' }); }
  };

  // ── Tracking settings handler ──
  const handleSaveTracking = async () => {
    setSavingTracking(true); setTrackingMsg(null);
    try {
      const res = await fetch('/api/admin/settings/tracking', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tracking) });
      const data = await res.json();
      if (data.success) setTrackingMsg({ type: 'success', text: 'Tracking settings disimpan' });
      else setTrackingMsg({ type: 'error', text: data.error ?? 'Gagal menyimpan' });
    } catch { setTrackingMsg({ type: 'error', text: 'Koneksi gagal' }); }
    finally { setSavingTracking(false); }
  };

  const inputClass = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20 focus:border-[#1565C0] pr-10';
  const inputClassNoPR = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20 focus:border-[#1565C0]';

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-xl font-bold text-[#0F172A]">Pengaturan</h1>
        <p className="text-[#64748B] text-sm mt-0.5">Kelola akun, keamanan, dan integrasi tracking</p>
      </div>

      {/* ── Info Akun ── */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#E3F2FD]"><User size={17} color="#1565C0" /></div>
          <h2 className="font-display font-semibold text-[#0F172A]">Info Akun</h2>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-[#64748B]">Nama</span><span className="font-medium text-[#0F172A]">{admin?.nama ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-[#64748B]">Email</span><span className="font-medium text-[#0F172A]">{admin?.email ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-[#64748B]">Role</span><span className="font-medium text-[#0F172A] capitalize">{admin?.role ?? '—'}</span></div>
        </div>
      </div>

      {/* ── Ganti Password ── */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#F5F3FF]"><Lock size={17} color="#7C3AED" /></div>
          <h2 className="font-display font-semibold text-[#0F172A]">Ganti Password</h2>
        </div>
        <MsgBox msg={pwMsg} />
        <form onSubmit={handleSubmitPw} className="space-y-4">
          {([
            { field: 'lama',       name: 'password_lama',            label: 'Password Lama',            placeholder: 'Masukkan password lama' },
            { field: 'baru',       name: 'password_baru',            label: 'Password Baru',            placeholder: 'Minimal 8 karakter' },
            { field: 'konfirmasi', name: 'password_baru_konfirmasi', label: 'Konfirmasi Password Baru', placeholder: 'Ulangi password baru' },
          ] as { field: keyof typeof show; name: keyof PasswordForm; label: string; placeholder: string }[]).map(({ field, name, label, placeholder }) => (
            <div key={name}>
              <label className="block text-xs font-medium text-[#374151] mb-1">{label}</label>
              <div className="relative">
                <input type={show[field] ? 'text' : 'password'} name={name} value={form[name]} onChange={handleChangePw} required minLength={name !== 'password_lama' ? 8 : undefined} className={inputClass} placeholder={placeholder} />
                <button type="button" onClick={() => toggleShow(field)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]">
                  {show[field] ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          ))}
          <button type="submit" disabled={pwLoading} className="w-full bg-[#1565C0] hover:bg-[#1565C0]/90 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors">
            {pwLoading ? 'Menyimpan...' : 'Simpan Password Baru'}
          </button>
        </form>
      </div>

      {/* ── Tracking & Analytics ── */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#FFF3E0]"><BarChart2 size={17} color="#F97316" /></div>
          <div><h2 className="font-display font-semibold text-[#0F172A]">Tracking & Analytics</h2><p className="text-xs text-[#64748B]">Meta Pixel, GA4, GTM, Search Console</p></div>
        </div>

        {/* Sub-section: Meta Pixel */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[#0F172A]">Meta Pixel</h3>
            {!pixelForm && (
              <button onClick={openAddPixel} className="flex items-center gap-1 text-xs text-[#1565C0] hover:text-[#1E88E5] font-medium">
                <Plus size={13} /> Tambah Pixel
              </button>
            )}
          </div>
          <MsgBox msg={pixelMsg} />

          {/* Pixel list */}
          {pixelsLoading ? (
            <div className="text-xs text-[#94A3B8] py-2">Memuat...</div>
          ) : pixels.length === 0 && !pixelForm ? (
            <div className="text-xs text-[#94A3B8] py-2 text-center border border-dashed border-gray-200 rounded-xl">Belum ada Meta Pixel yang dikonfigurasi</div>
          ) : (
            <div className="space-y-2 mb-3">
              {pixels.map(px => {
                let evts: string[] = [];
                try { evts = JSON.parse(px.events_enabled); } catch { /* empty */ }
                return (
                  <div key={px.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${px.is_active ? 'border-gray-200 bg-gray-50' : 'border-gray-100 bg-gray-50/50 opacity-60'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#0F172A] truncate">{px.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${px.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{px.is_active ? 'Aktif' : 'Nonaktif'}</span>
                      </div>
                      <div className="text-[11px] text-[#64748B] font-mono">{px.pixel_id}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {evts.map(ev => <span key={ev} className="text-[9px] px-1.5 py-0.5 rounded bg-[#E3F2FD] text-[#1565C0] font-medium">{ev}</span>)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => handleTogglePixel(px)} title={px.is_active ? 'Nonaktifkan' : 'Aktifkan'} className="p-1.5 rounded-lg hover:bg-gray-100 text-[#64748B]">
                        {px.is_active ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} />}
                      </button>
                      <button onClick={() => openEditPixel(px)} title="Edit" className="p-1.5 rounded-lg hover:bg-gray-100 text-[#64748B]"><Edit2 size={14} /></button>
                      <button onClick={() => handleDeletePixel(px.id)} title="Hapus" className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"><Trash2 size={14} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add/Edit pixel form */}
          {pixelForm && (
            <div className="border border-[#1565C0]/20 rounded-xl p-4 bg-[#F0F4F8] mb-3">
              <h4 className="text-sm font-semibold text-[#0F172A] mb-3">{pixelForm.mode === 'edit' ? 'Edit Pixel' : 'Tambah Pixel Baru'}</h4>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-[#374151] mb-1">Label *</label>
                  <input value={pixelForm.label} onChange={e => setPixelForm(f => f ? { ...f, label: e.target.value } : f)} placeholder="mis. Campaign Cari Buyer" className={inputClassNoPR} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#374151] mb-1">Pixel ID *</label>
                  <input value={pixelForm.pixel_id} onChange={e => setPixelForm(f => f ? { ...f, pixel_id: e.target.value } : f)} placeholder="000000000000000" className={inputClassNoPR} />
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-xs font-medium text-[#374151] mb-1.5">Events yang di-track</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_EVENTS.map(ev => (
                    <label key={ev} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={pixelForm.events.includes(ev)}
                        onChange={e => setPixelForm(f => f ? { ...f, events: e.target.checked ? [...f.events, ev] : f.events.filter(x => x !== ev) } : f)}
                        className="rounded border-gray-300 text-[#1565C0]" />
                      <span className="text-xs text-[#374151]">{ev}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSavePixel} disabled={savingPixel} className="flex-1 bg-[#1565C0] text-white rounded-xl py-2 text-sm font-semibold disabled:opacity-50">
                  {savingPixel ? 'Menyimpan...' : pixelForm.mode === 'edit' ? 'Simpan Perubahan' : 'Tambahkan'}
                </button>
                <button onClick={() => { setPixelForm(null); setPixelMsg(null); }} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-[#64748B] hover:bg-gray-50">Batal</button>
              </div>
            </div>
          )}
        </div>

        {/* Sub-section: GA4 + GTM + Search Console */}
        <div className="border-t border-gray-100 pt-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[#0F172A] mb-1">Google Analytics 4</h3>
            <input value={tracking.ga4_measurement_id} onChange={e => setTracking(t => ({ ...t, ga4_measurement_id: e.target.value }))} placeholder="G-XXXXXXXXXX" className={inputClassNoPR} />
            <p className="text-[10px] text-[#94A3B8] mt-0.5">Kosongkan untuk menonaktifkan GA4</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#0F172A] mb-1">Google Tag Manager <span className="text-[#94A3B8] font-normal">(opsional)</span></h3>
            <input value={tracking.gtm_container_id} onChange={e => setTracking(t => ({ ...t, gtm_container_id: e.target.value }))} placeholder="GTM-XXXXXXX" className={inputClassNoPR} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#0F172A] mb-1">Google Search Console <span className="text-[#94A3B8] font-normal">(opsional)</span></h3>
            <input value={tracking.search_console_verification} onChange={e => setTracking(t => ({ ...t, search_console_verification: e.target.value }))} placeholder="Meta tag content value" className={inputClassNoPR} />
            <p className="text-[10px] text-[#94A3B8] mt-0.5">Search Console → Settings → Ownership verification → HTML tag → copy nilai content="..."</p>
          </div>
          <MsgBox msg={trackingMsg} />
          <button onClick={handleSaveTracking} disabled={savingTracking} className="w-full bg-[#F97316] hover:bg-[#EA6C00] disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors">
            {savingTracking ? 'Menyimpan...' : 'Simpan Tracking Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
