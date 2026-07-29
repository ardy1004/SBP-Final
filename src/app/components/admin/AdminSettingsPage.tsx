import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router';
import GridLayout, { WidthProvider, type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { Lock, User, CheckCircle, XCircle, Eye, EyeOff, BarChart2, Plus, Trash2, Edit2, ToggleLeft, ToggleRight, KeyRound, RotateCcw, Send } from 'lucide-react';
import {
  getAiKeys, saveAiKeys, getAiStatus, type AiProviderId, type AiKeyInfo, type AiStatusInfo, bacaJson,
  getSchedulerKeys, saveSchedulerKeys, getSchedulerConfig, saveSchedulerConfig, getSchedulerAccounts,
  type SchedulerProviderId, type SchedulerKeyInfo, type SchedulePresetRow, type SchedulerAccountsResult,
} from '../../../lib/api';

const ResponsiveGridLayout = WidthProvider(GridLayout);

// Blok Pengaturan bisa digeser & di-resize bebas (posisi/ukuran tersimpan di localStorage per browser).
const DEFAULT_SETTINGS_LAYOUT: Layout[] = [
  { i: 'info-akun',    x: 0, y: 0,  w: 6,  h: 8,  minW: 3, minH: 5 },
  { i: 'password',     x: 6, y: 0,  w: 6,  h: 13, minW: 3, minH: 8 },
  { i: 'tracking',     x: 0, y: 8,  w: 12, h: 20, minW: 4, minH: 8 },
  { i: 'ai-providers', x: 0, y: 28, w: 12, h: 14, minW: 4, minH: 6 },
  { i: 'scheduler',    x: 0, y: 42, w: 12, h: 22, minW: 4, minH: 10 },
];
const SETTINGS_LAYOUT_STORAGE_KEY = 'sbp_admin_settings_layout';
// Selector elemen yang TIDAK memicu drag (blacklist) — drag tetap aktif dari area
// kosong/header kartu, jadi tidak perlu ubah markup tiap kartu untuk kasih drag handle.
const DRAG_CANCEL_SELECTOR = 'input, textarea, select, button, a, label';

const AI_PROVIDERS: { id: AiProviderId; label: string; hint: string }[] = [
  { id: 'gemini',     label: 'Google Gemini', hint: 'aistudio.google.com/apikey' },
  { id: 'groq',       label: 'Groq',          hint: 'console.groq.com/keys' },
  { id: 'openrouter', label: 'OpenRouter',    hint: 'openrouter.ai/keys' },
  { id: 'deepseek',   label: 'DeepSeek',      hint: 'platform.deepseek.com/api_keys' },
];

const STATUS_COLOR: Record<'green' | 'yellow' | 'red', string> = {
  green: '#10B981', yellow: '#F59E0B', red: '#EF4444',
};

const SCHEDULER_PROVIDERS: { id: SchedulerProviderId; label: string; hint: string }[] = [
  { id: 'buffer', label: 'Buffer (YT Shorts, TikTok, Threads)', hint: 'buffer.com → Settings → API' },
  { id: 'zernio', label: 'Zernio (Facebook Pages, Instagram)',  hint: 'docs.zernio.com' },
];
const DEFAULT_SCHEDULE_PRESET: SchedulePresetRow[] = [
  { slot: 1, fb_ig_threads: '09:00', tiktok: '12:30', youtube: '12:30' },
  { slot: 2, fb_ig_threads: '11:00', tiktok: '18:00', youtube: '17:30' },
  { slot: 3, fb_ig_threads: '13:00', tiktok: '19:30', youtube: '19:00' },
  { slot: 4, fb_ig_threads: '19:00', tiktok: '20:30', youtube: '20:00' },
  { slot: 5, fb_ig_threads: '20:00', tiktok: '21:00', youtube: '13:30' },
];

interface AdminUser { sub: number; email: string; nama: string; role: string; }
interface PasswordForm { password_lama: string; password_baru: string; password_baru_konfirmasi: string; }
interface PixelConfig { id: number; label: string; pixel_id: string; is_active: number; events_enabled: string; created_at: string; has_capi_token: 0 | 1; }
interface TrackingSettings { ga4_measurement_id: string; ga4_property_id: string; gtm_container_id: string; search_console_verification: string; }
interface PixelFormState { mode: 'add' | 'edit'; id?: number; label: string; pixel_id: string; events: string[]; capi_access_token: string; }
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

  // ── Layout blok (drag & resize bebas, tersimpan di localStorage) ──
  const [settingsLayout, setSettingsLayout] = useState<Layout[]>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_LAYOUT_STORAGE_KEY);
      if (saved) {
        const parsed: Layout[] = JSON.parse(saved);
        // Merge dengan default: kartu baru yang belum ada di layout tersimpan
        // (ditambahkan di rilis berikutnya) tetap dapat posisi default yang wajar,
        // bukan ditempatkan asal 1x1 oleh react-grid-layout.
        const savedKeys = new Set(parsed.map(l => l.i));
        const missing = DEFAULT_SETTINGS_LAYOUT.filter(d => !savedKeys.has(d.i));
        const defaultKeys = new Set(DEFAULT_SETTINGS_LAYOUT.map(d => d.i));
        const valid = parsed.filter(l => defaultKeys.has(l.i)); // buang kartu yang sudah tidak ada
        return [...valid, ...missing];
      }
    } catch { /* noop */ }
    return DEFAULT_SETTINGS_LAYOUT;
  });
  const handleSettingsLayoutChange = (next: Layout[]) => {
    setSettingsLayout(next);
    try { localStorage.setItem(SETTINGS_LAYOUT_STORAGE_KEY, JSON.stringify(next)); } catch { /* noop */ }
  };
  const resetSettingsLayout = () => {
    setSettingsLayout(DEFAULT_SETTINGS_LAYOUT);
    try { localStorage.removeItem(SETTINGS_LAYOUT_STORAGE_KEY); } catch { /* noop */ }
  };

  // Di layar sempit: paksa semua kartu full-width & matikan drag/resize (RGL tidak
  // nyaman dipakai sentuh, dan kartu setengah-lebar terlalu kurus di mobile).
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  const stackedLayout: Layout[] = (() => {
    let y = 0;
    return settingsLayout.map(l => {
      const item = { ...l, x: 0, y, w: 12 };
      y += l.h;
      return item;
    });
  })();
  const effectiveLayout = isNarrow ? stackedLayout : settingsLayout;

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
  const [showCapiToken, setShowCapiToken] = useState(false);

  const [tracking, setTracking] = useState<TrackingSettings>({ ga4_measurement_id: '', ga4_property_id: '', gtm_container_id: '', search_console_verification: '' });
  const [savingTracking, setSavingTracking] = useState(false);
  const [trackingMsg, setTrackingMsg] = useState<Msg | null>(null);

  // ── AI Providers (API keys + status) ──
  const [aiKeys, setAiKeys] = useState<Record<AiProviderId, AiKeyInfo> | null>(null);
  const [aiInput, setAiInput] = useState<Record<AiProviderId, string>>({ gemini: '', groq: '', openrouter: '', deepseek: '' });
  const [aiStatus, setAiStatus] = useState<Record<AiProviderId, AiStatusInfo> | null>(null);
  const [aiSaving, setAiSaving] = useState<AiProviderId | null>(null);
  const [aiMsg, setAiMsg] = useState<Msg | null>(null);

  const loadAi = () => {
    getAiKeys().then(r => { if (r.success && r.data) setAiKeys(r.data); });
    getAiStatus().then(r => { if (r.success && r.data) setAiStatus(r.data); });
  };
  useEffect(() => { loadAi(); }, []);

  const handleSaveAiKey = async (id: AiProviderId) => {
    const val = aiInput[id].trim();
    if (!val) { setAiMsg({ type: 'error', text: 'Isi key dulu sebelum menyimpan.' }); return; }
    setAiSaving(id); setAiMsg(null);
    const r = await saveAiKeys({ [id]: val });
    setAiSaving(null);
    if (r.success) {
      setAiMsg({ type: 'success', text: `Key ${id} tersimpan.` });
      setAiInput(s => ({ ...s, [id]: '' }));
      loadAi();
    } else {
      setAiMsg({ type: 'error', text: r.error ?? 'Gagal menyimpan key.' });
    }
  };

  // ── Scheduler ViralFrame (Buffer + Zernio) ──
  const [schedulerKeys, setSchedulerKeys] = useState<Record<SchedulerProviderId, SchedulerKeyInfo> | null>(null);
  const [schedulerInput, setSchedulerInput] = useState<Record<SchedulerProviderId, string>>({ buffer: '', zernio: '' });
  const [schedulerSaving, setSchedulerSaving] = useState<SchedulerProviderId | null>(null);
  const [schedulerMsg, setSchedulerMsg] = useState<Msg | null>(null);

  const [channelIds, setChannelIds] = useState({
    buffer_channel_id_youtube: '', buffer_channel_id_tiktok: '', buffer_channel_id_threads: '',
    zernio_account_id_facebook: '', zernio_account_id_instagram: '',
  });
  const [preset, setPreset] = useState<SchedulePresetRow[]>(DEFAULT_SCHEDULE_PRESET);
  const [savingSchedulerConfig, setSavingSchedulerConfig] = useState(false);
  const [schedulerConfigMsg, setSchedulerConfigMsg] = useState<Msg | null>(null);
  const [schedulerAccounts, setSchedulerAccounts] = useState<SchedulerAccountsResult | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const handleLoadAccounts = async () => {
    setLoadingAccounts(true);
    const r = await getSchedulerAccounts();
    setLoadingAccounts(false);
    if (r.success && r.data) setSchedulerAccounts(r.data);
    else setSchedulerConfigMsg({ type: 'error', text: r.error ?? 'Gagal memuat daftar akun' });
  };

  const bufferServiceKey = (service: string | null): keyof typeof channelIds | null => {
    if (service === 'youtube') return 'buffer_channel_id_youtube';
    if (service === 'tiktok') return 'buffer_channel_id_tiktok';
    if (service === 'threads') return 'buffer_channel_id_threads';
    return null;
  };
  const zernioPlatformKey = (platform: string | null): keyof typeof channelIds | null => {
    if (platform === 'facebook') return 'zernio_account_id_facebook';
    if (platform === 'instagram') return 'zernio_account_id_instagram';
    return null;
  };
  const applyId = (key: keyof typeof channelIds, id: string) => setChannelIds(c => ({ ...c, [key]: id }));
  const autoFillAllIds = () => {
    if (!schedulerAccounts) return;
    setChannelIds(c => {
      const next = { ...c };
      for (const ch of schedulerAccounts.buffer.channels ?? []) {
        const key = bufferServiceKey(ch.service);
        if (key && ch.id) next[key] = ch.id;
      }
      for (const ac of schedulerAccounts.zernio.accounts ?? []) {
        const key = zernioPlatformKey(ac.platform);
        if (key && ac.id) next[key] = ac.id;
      }
      return next;
    });
    setSchedulerConfigMsg({ type: 'success', text: 'ID terisi otomatis — cek lalu klik "Simpan Konfigurasi Scheduler".' });
  };

  const loadScheduler = () => {
    getSchedulerKeys().then(r => { if (r.success && r.data) setSchedulerKeys(r.data); });
    getSchedulerConfig().then(r => {
      if (r.success && r.data) {
        setChannelIds({
          buffer_channel_id_youtube: r.data.buffer_channel_id_youtube ?? '',
          buffer_channel_id_tiktok: r.data.buffer_channel_id_tiktok ?? '',
          buffer_channel_id_threads: r.data.buffer_channel_id_threads ?? '',
          zernio_account_id_facebook: r.data.zernio_account_id_facebook ?? '',
          zernio_account_id_instagram: r.data.zernio_account_id_instagram ?? '',
        });
        if (r.data.viralframe_schedule_preset?.length === 5) setPreset(r.data.viralframe_schedule_preset);
      }
    });
  };
  useEffect(() => { loadScheduler(); }, []);

  const handleSaveSchedulerKey = async (id: SchedulerProviderId) => {
    const val = schedulerInput[id].trim();
    if (!val) { setSchedulerMsg({ type: 'error', text: 'Isi key dulu sebelum menyimpan.' }); return; }
    setSchedulerSaving(id); setSchedulerMsg(null);
    const r = await saveSchedulerKeys({ [id]: val });
    setSchedulerSaving(null);
    if (r.success) {
      setSchedulerMsg({ type: 'success', text: `Key ${id} tersimpan.` });
      setSchedulerInput(s => ({ ...s, [id]: '' }));
      loadScheduler();
    } else {
      setSchedulerMsg({ type: 'error', text: r.error ?? 'Gagal menyimpan key.' });
    }
  };

  const setPresetTime = (slot: number, col: 'fb_ig_threads' | 'tiktok' | 'youtube', val: string) => {
    setPreset(prev => prev.map(row => row.slot === slot ? { ...row, [col]: val } : row));
  };

  const handleSaveSchedulerConfig = async () => {
    setSavingSchedulerConfig(true); setSchedulerConfigMsg(null);
    const r = await saveSchedulerConfig({ ...channelIds, viralframe_schedule_preset: preset });
    setSavingSchedulerConfig(false);
    if (r.success) setSchedulerConfigMsg({ type: 'success', text: 'Konfigurasi scheduler disimpan' });
    else setSchedulerConfigMsg({ type: 'error', text: r.error ?? 'Gagal menyimpan' });
  };

  // ── Load pixel configs + tracking settings ──
  useEffect(() => {
    Promise.all([
      fetch('/api/admin/pixel-configs', { credentials: 'include' }).then(r => bacaJson(r)),
      fetch('/api/admin/settings/tracking', { credentials: 'include' }).then(r => bacaJson(r)),
    ]).then(([pRes, tRes]) => {
      if (pRes.success) setPixels(pRes.data?.pixels ?? []);
      if (tRes.success && tRes.data) {
        setTracking({
          ga4_measurement_id:          tRes.data.ga4_measurement_id          ?? '',
          ga4_property_id:             tRes.data.ga4_property_id             ?? '',
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
      const data = await bacaJson(res);
      if (data.success) { setPwMsg({ type: 'success', text: data.data?.message ?? 'Password berhasil diubah' }); setForm({ password_lama: '', password_baru: '', password_baru_konfirmasi: '' }); }
      else setPwMsg({ type: 'error', text: data.error ?? 'Gagal mengubah password' });
    } catch { setPwMsg({ type: 'error', text: 'Koneksi ke server gagal' }); }
    finally { setPwLoading(false); }
  };

  // ── Pixel handlers ──
  const openAddPixel = () => { setShowCapiToken(false); setPixelForm({ mode: 'add', label: '', pixel_id: '', events: [...ALL_EVENTS], capi_access_token: '' }); };
  const openEditPixel = (px: PixelConfig) => {
    let events: string[];
    try { events = JSON.parse(px.events_enabled); } catch { events = [...ALL_EVENTS]; }
    setShowCapiToken(false);
    setPixelForm({ mode: 'edit', id: px.id, label: px.label, pixel_id: px.pixel_id, events, capi_access_token: '' });
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
      const patchBody: Record<string, unknown> = { label, pixel_id, events_enabled: pixelForm.events };
      if (pixelForm.capi_access_token.trim()) {
        patchBody.capi_access_token = pixelForm.capi_access_token.trim();
      } else if (!isEdit) {
        // add mode, blank = omit (stays NULL)
      } else {
        // edit mode, blank = no change (don't send key)
      }
      const res = await fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patchBody) });
      const data = await bacaJson(res);
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
      const data = await bacaJson(res);
      if (data.success) setPixels(prev => prev.map(p => p.id === px.id ? data.data.pixel : p));
    } catch { setPixelMsg({ type: 'error', text: 'Gagal mengubah status pixel' }); }
  };

  const handleDeletePixel = async (id: number) => {
    if (!window.confirm('Hapus pixel config ini?')) return;
    try {
      const res = await fetch(`/api/admin/pixel-configs/${id}`, { method: 'DELETE', credentials: 'include' });
      const data = await bacaJson(res);
      if (data.success) { setPixels(prev => prev.filter(p => p.id !== id)); setPixelMsg({ type: 'success', text: 'Pixel dihapus' }); }
      else setPixelMsg({ type: 'error', text: data.error ?? 'Gagal menghapus pixel' });
    } catch { setPixelMsg({ type: 'error', text: 'Koneksi gagal' }); }
  };

  // ── Tracking settings handler ──
  const handleSaveTracking = async () => {
    setSavingTracking(true); setTrackingMsg(null);
    try {
      const res = await fetch('/api/admin/settings/tracking', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tracking) });
      const data = await bacaJson(res);
      if (data.success) setTrackingMsg({ type: 'success', text: 'Tracking settings disimpan' });
      else setTrackingMsg({ type: 'error', text: data.error ?? 'Gagal menyimpan' });
    } catch { setTrackingMsg({ type: 'error', text: 'Koneksi gagal' }); }
    finally { setSavingTracking(false); }
  };

  const inputClass = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20 focus:border-[#1565C0] pr-10';
  const inputClassNoPR = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20 focus:border-[#1565C0]';

  return (
    <div className="space-y-4 max-w-[1600px]">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-xl font-bold text-[#0F172A]">Pengaturan</h1>
          <p className="text-[#64748B] text-sm mt-0.5">Kelola akun, keamanan, dan integrasi tracking — geser/tarik sudut kartu untuk atur posisi &amp; ukuran</p>
        </div>
        <button onClick={resetSettingsLayout}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#64748B] border border-gray-200 hover:bg-gray-50 transition-colors flex-shrink-0">
          <RotateCcw size={13} /> Reset Layout
        </button>
      </div>

      <ResponsiveGridLayout
        className="layout"
        layout={effectiveLayout}
        onLayoutChange={isNarrow ? undefined : handleSettingsLayoutChange}
        cols={12}
        rowHeight={20}
        margin={[16, 16]}
        draggableCancel={DRAG_CANCEL_SELECTOR}
        resizeHandles={['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne']}
        compactType={null}
        preventCollision={false}
        isDraggable={!isNarrow}
        isResizable={!isNarrow}
      >
      {/* ── Info Akun ── */}
      <div key="info-akun" className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 overflow-y-auto">
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
      <div key="password" className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 overflow-y-auto">
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
      <div key="tracking" className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 overflow-y-auto">
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
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[#64748B] font-mono">{px.pixel_id}</span>
                        {px.has_capi_token ? <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">CAPI ✓</span> : null}
                      </div>
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
                <label className="block text-xs font-medium text-[#374151] mb-1">CAPI Access Token <span className="text-[#94A3B8] font-normal">(opsional)</span></label>
                <div className="relative">
                  <input
                    type={showCapiToken ? 'text' : 'password'}
                    value={pixelForm.capi_access_token}
                    onChange={e => setPixelForm(f => f ? { ...f, capi_access_token: e.target.value } : f)}
                    placeholder={pixelForm.mode === 'edit' ? '(kosong = tidak ubah)' : '(kosong = tidak dikonfigurasi)'}
                    className={inputClass}
                    autoComplete="off"
                  />
                  <button type="button" onClick={() => setShowCapiToken(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]">
                    {showCapiToken ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="text-[10px] text-[#94A3B8] mt-0.5">Dapatkan dari Meta Events Manager → Settings → Conversions API</p>
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
            <input value={tracking.ga4_property_id} onChange={e => setTracking(t => ({ ...t, ga4_property_id: e.target.value }))} placeholder="Property ID (mis. 123456789)" className={`${inputClassNoPR} mt-2`} />
            <p className="text-[10px] text-[#94A3B8] mt-0.5">Beda dari Measurement ID di atas — angka saja, dari GA4 Admin → Property Settings. Dipakai untuk menarik laporan pengunjung ke tab Ringkasan (butuh Service Account terhubung, lihat dokumentasi setup).</p>
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

      {/* ── AI Providers (ViralFrame) ── */}
      <div key="ai-providers" className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 overflow-y-auto">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#ECFDF5]"><KeyRound size={17} color="#10B981" /></div>
          <div>
            <h2 className="font-display font-semibold text-[#0F172A]">AI Providers</h2>
            <p className="text-xs text-[#64748B]">API key untuk generate naskah ViralFrame · ditampilkan ter-mask (4 digit akhir)</p>
          </div>
        </div>

        <div className="space-y-4">
          {AI_PROVIDERS.map(p => {
            const info = aiKeys?.[p.id];
            const st = aiStatus?.[p.id];
            return (
              <div key={p.id}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-semibold text-[#0F172A] flex items-center gap-2">
                    {/* Indikator status kuota */}
                    <span title={st?.detail ?? 'memuat...'} className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: st ? STATUS_COLOR[st.color] : '#CBD5E1' }} />
                    {p.label}
                    {info?.configured && <span className="text-[10px] font-normal text-[#64748B]">({info.masked}{info.source === 'secret' ? ' · dari secret' : ''})</span>}
                  </label>
                  {st && <span className="text-[10px] text-[#94A3B8]">{st.detail}</span>}
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={aiInput[p.id]}
                    onChange={e => setAiInput(s => ({ ...s, [p.id]: e.target.value }))}
                    placeholder={info?.configured ? 'Ketik key baru untuk mengganti…' : `Tempel API key (${p.hint})`}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                  />
                  <button
                    onClick={() => handleSaveAiKey(p.id)}
                    disabled={aiSaving === p.id || !aiInput[p.id].trim()}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[#10B981] hover:bg-[#059669] disabled:opacity-40 transition-colors flex-shrink-0"
                  >
                    {aiSaving === p.id ? '...' : 'Simpan'}
                  </button>
                </div>
                <p className="text-[10px] text-[#94A3B8] mt-0.5">Dapatkan key di {p.hint}</p>
              </div>
            );
          })}
          <MsgBox msg={aiMsg} />
          <div className="flex items-center gap-3 text-[10px] text-[#94A3B8] pt-1">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR.green }} /> Kuota aman</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR.yellow }} /> Hampir habis / rate-limit</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR.red }} /> Habis / belum diisi</span>
          </div>
        </div>
      </div>

      {/* ── Scheduler ViralFrame (Buffer + Zernio) ── */}
      <div key="scheduler" className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 overflow-y-auto">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#EFF6FF]"><Send size={17} color="#1565C0" /></div>
          <div>
            <h2 className="font-display font-semibold text-[#0F172A]">Scheduler Sosmed (Buffer &amp; Zernio)</h2>
            <p className="text-xs text-[#64748B]">Auto-jadwalkan video Content Library ViralFrame ke YT Shorts, TikTok, Threads, FB Pages &amp; Instagram</p>
          </div>
        </div>

        <div className="space-y-4">
          {SCHEDULER_PROVIDERS.map(p => {
            const info = schedulerKeys?.[p.id];
            return (
              <div key={p.id}>
                <label className="text-sm font-semibold text-[#0F172A] flex items-center gap-2 mb-1">
                  {p.label}
                  {info?.configured && <span className="text-[10px] font-normal text-[#64748B]">({info.masked})</span>}
                </label>
                <div className="flex gap-2">
                  <input type="password" value={schedulerInput[p.id]} onChange={e => setSchedulerInput(s => ({ ...s, [p.id]: e.target.value }))}
                    placeholder={info?.configured ? 'Ketik key baru untuk mengganti…' : `Tempel API key (${p.hint})`}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20" />
                  <button onClick={() => handleSaveSchedulerKey(p.id)} disabled={schedulerSaving === p.id || !schedulerInput[p.id].trim()}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[#1565C0] hover:bg-[#1565C0]/90 disabled:opacity-40 transition-colors flex-shrink-0">
                    {schedulerSaving === p.id ? '...' : 'Simpan'}
                  </button>
                </div>
              </div>
            );
          })}
          <MsgBox msg={schedulerMsg} />

          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-[#0F172A]">ID Channel / Akun</h3>
              <button onClick={handleLoadAccounts} disabled={loadingAccounts}
                className="text-xs font-semibold text-[#1565C0] underline disabled:opacity-50">
                {loadingAccounts ? 'Memuat...' : 'Lihat Daftar Akun & ID'}
              </button>
            </div>
            <p className="text-[10px] text-[#94A3B8] mb-2">Channel/account ID tidak tampil di dashboard Buffer/Zernio biasa — klik tombol di atas untuk ambil langsung dari API pakai key yang sudah kamu simpan (simpan API key dulu sebelum klik).</p>

            {schedulerAccounts && (
              <div className="mb-3 space-y-2 text-xs">
                <button onClick={autoFillAllIds}
                  className="w-full py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700">
                  ⚡ Isi Otomatis Semua Field ID
                </button>
                <div className="rounded-xl border border-gray-100 p-2.5">
                  <div className="font-semibold text-[#0F172A] mb-1">Channel Buffer</div>
                  {!schedulerAccounts.buffer.ok && <p className="text-red-600">{schedulerAccounts.buffer.error}</p>}
                  {schedulerAccounts.buffer.ok && (schedulerAccounts.buffer.channels?.length ?? 0) === 0 && <p className="text-[#94A3B8]">Tidak ada channel tertaut.</p>}
                  {schedulerAccounts.buffer.channels?.map(ch => {
                    const key = bufferServiceKey(ch.service);
                    return (
                      <div key={ch.id} className="flex items-center justify-between gap-2 py-0.5">
                        <span className="text-[#374151]">{ch.name} <span className="text-[#94A3B8]">({ch.service})</span></span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <code className="bg-gray-50 px-1.5 py-0.5 rounded select-all">{ch.id}</code>
                          {key ? (
                            <button onClick={() => applyId(key, ch.id)} className="text-[#1565C0] font-semibold hover:underline">Pakai →</button>
                          ) : (
                            <span className="text-[#94A3B8]" title="Service tidak dikenali, isi manual">?</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="rounded-xl border border-gray-100 p-2.5">
                  <div className="font-semibold text-[#0F172A] mb-1">Akun Zernio</div>
                  {!schedulerAccounts.zernio.ok && <p className="text-red-600">{schedulerAccounts.zernio.error}</p>}
                  {schedulerAccounts.zernio.ok && (schedulerAccounts.zernio.accounts?.length ?? 0) === 0 && <p className="text-[#94A3B8]">Tidak ada akun tertaut.</p>}
                  {schedulerAccounts.zernio.accounts?.map((ac, i) => {
                    const key = zernioPlatformKey(ac.platform);
                    return (
                      <div key={ac.id ?? i} className="py-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[#374151]">{ac.name ?? '(nama tidak terbaca)'} <span className="text-[#94A3B8]">({ac.platform ?? '?'})</span></span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <code className="bg-gray-50 px-1.5 py-0.5 rounded select-all">{ac.id ?? '(id tidak terbaca)'}</code>
                            {key && ac.id ? (
                              <button onClick={() => applyId(key, ac.id!)} className="text-[#1565C0] font-semibold hover:underline">Pakai →</button>
                            ) : (
                              <span className="text-[#94A3B8]" title="Platform/ID tidak dikenali, isi manual">?</span>
                            )}
                          </div>
                        </div>
                        {ac.raw !== undefined && (
                          <pre className="mt-1 text-[9px] bg-amber-50 border border-amber-200 rounded p-1.5 overflow-x-auto select-all whitespace-pre-wrap">{JSON.stringify(ac.raw, null, 1)}</pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={channelIds.buffer_channel_id_youtube} onChange={e => setChannelIds(c => ({ ...c, buffer_channel_id_youtube: e.target.value }))} placeholder="Buffer channel ID — YouTube Shorts" className={inputClassNoPR} />
              <input value={channelIds.buffer_channel_id_tiktok} onChange={e => setChannelIds(c => ({ ...c, buffer_channel_id_tiktok: e.target.value }))} placeholder="Buffer channel ID — TikTok" className={inputClassNoPR} />
              <input value={channelIds.buffer_channel_id_threads} onChange={e => setChannelIds(c => ({ ...c, buffer_channel_id_threads: e.target.value }))} placeholder="Buffer channel ID — Threads" className={inputClassNoPR} />
              <input value={channelIds.zernio_account_id_facebook} onChange={e => setChannelIds(c => ({ ...c, zernio_account_id_facebook: e.target.value }))} placeholder="Zernio account ID — Facebook Pages" className={inputClassNoPR} />
              <input value={channelIds.zernio_account_id_instagram} onChange={e => setChannelIds(c => ({ ...c, zernio_account_id_instagram: e.target.value }))} placeholder="Zernio account ID — Instagram" className={inputClassNoPR} />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-[#0F172A] mb-1">Preset Jam Primetime (WIB)</h3>
            <p className="text-[10px] text-[#94A3B8] mb-2">Klik "Jadwalkan ke Sosmed" di Content Library otomatis pakai slot kosong berikutnya hari ini, jam sesuai tabel ini.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left text-[#64748B]">
                    <th className="py-1 pr-2 font-semibold">Slot</th>
                    <th className="py-1 px-2 font-semibold">FB / IG / Threads</th>
                    <th className="py-1 px-2 font-semibold">TikTok</th>
                    <th className="py-1 pl-2 font-semibold">YouTube Shorts</th>
                  </tr>
                </thead>
                <tbody>
                  {preset.map(row => (
                    <tr key={row.slot} className="border-t border-gray-50">
                      <td className="py-1.5 pr-2 font-medium text-[#0F172A]">{row.slot}</td>
                      <td className="py-1.5 px-2"><input type="time" value={row.fb_ig_threads} onChange={e => setPresetTime(row.slot, 'fb_ig_threads', e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs" /></td>
                      <td className="py-1.5 px-2"><input type="time" value={row.tiktok} onChange={e => setPresetTime(row.slot, 'tiktok', e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs" /></td>
                      <td className="py-1.5 pl-2"><input type="time" value={row.youtube} onChange={e => setPresetTime(row.slot, 'youtube', e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <MsgBox msg={schedulerConfigMsg} />
            <button onClick={handleSaveSchedulerConfig} disabled={savingSchedulerConfig}
              className="w-full mt-2 bg-[#1565C0] hover:bg-[#1565C0]/90 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors">
              {savingSchedulerConfig ? 'Menyimpan...' : 'Simpan Konfigurasi Scheduler'}
            </button>
          </div>
        </div>
      </div>
      </ResponsiveGridLayout>
    </div>
  );
}
