// Kartu "Akun Agent" di Admin → Pengaturan: kredensial storage (Cloudinary) &
// scheduler (Buffer/Zernio) per agent ViralFrame — tinggal tempel lalu Simpan.
//
// Aturan yang tercermin di UI (lihat functions/_lib/agentAccounts.js):
//   • Storage kosong  -> jatuh ke akun global, ditandai "pakai akun global".
//   • Scheduler kosong -> penjadwalan DITOLAK, bukan diam-diam pakai akun agent
//     lain. Makanya badge merahnya tegas, bukan sekadar abu-abu.
//
// Rahasia tidak pernah dikirim utuh ke browser. Field rahasia yang dibiarkan
// KOSONG berarti "jangan ubah" — nilai lamanya ditampilkan sebagai placeholder
// ter-mask, jadi tidak ada cara tidak sengaja mengosongkan key yang sudah ada.

import { useState, useEffect, useCallback } from 'react';
import { Users, CheckCircle, XCircle, RefreshCw, Save, Play, Pause, ChevronDown, ChevronRight } from 'lucide-react';
import {
  getAgentAccounts, saveAgentAccount, saveModeAkun, getSchedulerAccounts,
  type AgentAccount, type AgentAccountInput, type AgentChannels, type ModeAkun,
  type SchedulerAccountsResult, type SchedulerPlatform,
} from '../../../lib/api';
import { PROPERTY_TYPES } from '../../../lib/propertyTypes';

interface Msg { type: 'success' | 'error'; text: string }

const PLATFORM_LABEL: Record<SchedulerPlatform, string> = {
  youtube: 'YouTube', tiktok: 'TikTok', threads: 'Threads', facebook: 'Facebook', instagram: 'Instagram',
};
const PLATFORMS = Object.keys(PLATFORM_LABEL) as SchedulerPlatform[];

type FormState = {
  gmail: string; spesialis: string[];
  cloudinary_name: string; cloudinary_api_key: string; cloudinary_api_secret: string;
  buffer_api_key: string; zernio_api_key: string;
  channels: AgentChannels;
  jam_auto: string; auto_aktif: boolean;
};

function formDari(a: AgentAccount): FormState {
  return {
    gmail: a.gmail, spesialis: a.spesialis,
    cloudinary_name: a.cloudinary_name, cloudinary_api_key: a.cloudinary_api_key,
    cloudinary_api_secret: '', buffer_api_key: '', zernio_api_key: '',
    channels: { ...a.channels },
    jam_auto: a.jam_auto, auto_aktif: a.auto_aktif,
  };
}

const INPUT_CLS = 'w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]/30';
const LABEL_CLS = 'block text-xs font-semibold text-[#334155] mb-1';
const CIUT_KEY = 'sbp_akun_agent_ciut';

function Lencana({ ok, teks }: { ok: boolean; teks: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
      {ok ? <CheckCircle size={11} /> : <XCircle size={11} />}{teks}
    </span>
  );
}

export default function AkunAgentCard() {
  const [items, setItems] = useState<AgentAccount[] | null>(null);
  const [buka, setBuka] = useState<number | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [akunTertaut, setAkunTertaut] = useState<SchedulerAccountsResult | null>(null);
  const [memuatAkun, setMemuatAkun] = useState(false);
  const [mode, setMode] = useState<ModeAkun>('terpusat');
  const [autoAktif, setAutoAktif] = useState(false);
  const [utama, setUtama] = useState<number | null>(null);
  const [ubahMode, setUbahMode] = useState(false);
  // Default CIUT: halaman ini tujuan utamanya mengelola video, kredensial jarang
  // disentuh setelah terpasang. Ringkasan di header yang menjaga statusnya tetap
  // terbaca tanpa perlu dibuka.
  const [ciut, setCiut] = useState(true);
  useEffect(() => { try { setCiut(localStorage.getItem(CIUT_KEY) !== '0'); } catch { /* noop */ } }, []);
  const toggleCiut = () => setCiut(c => {
    const next = !c;
    try { localStorage.setItem(CIUT_KEY, next ? '1' : '0'); } catch { /* noop */ }
    return next;
  });

  const muat = useCallback(async () => {
    const r = await getAgentAccounts();
    if (r.success && r.data) {
      setItems(r.data.items); setMode(r.data.mode); setUtama(r.data.utama); setAutoAktif(r.data.auto_aktif);
    }
    else setMsg({ type: 'error', text: r.error ?? 'Gagal memuat akun agent' });
  }, []);

  const gantiAuto = async (nyala: boolean) => {
    setUbahMode(true); setMsg(null);
    const r = await saveModeAkun({ auto_aktif: nyala });
    setUbahMode(false);
    if (r.success) { setAutoAktif(nyala); muat(); }
    else setMsg({ type: 'error', text: r.error ?? 'Gagal mengubah saklar auto' });
  };

  const gantiMode = async (m: ModeAkun) => {
    setUbahMode(true); setMsg(null);
    const r = await saveModeAkun({ mode: m });
    setUbahMode(false);
    if (r.success) { setMode(m); muat(); }
    else setMsg({ type: 'error', text: r.error ?? 'Gagal mengubah mode' });
  };

  useEffect(() => { muat(); }, [muat]);

  const bukaAgent = (a: AgentAccount) => {
    if (buka === a.character_id) { setBuka(null); setForm(null); return; }
    setBuka(a.character_id); setForm(formDari(a)); setMsg(null); setAkunTertaut(null);
  };

  const ubah = (k: keyof FormState, v: string | string[]) =>
    setForm(f => (f ? { ...f, [k]: v } as FormState : f));

  const toggleSpesialis = (nilai: string) =>
    setForm(f => f ? { ...f, spesialis: f.spesialis.includes(nilai) ? f.spesialis.filter(s => s !== nilai) : [...f.spesialis, nilai] } : f);

  const simpan = async (characterId: number) => {
    if (!form) return;
    setMenyimpan(true); setMsg(null);
    // Field rahasia hanya ikut terkirim kalau benar-benar diisi — kosong berarti
    // "pertahankan nilai lama", bukan "hapus".
    const body: AgentAccountInput = {
      gmail: form.gmail, spesialis: form.spesialis,
      cloudinary_name: form.cloudinary_name, cloudinary_api_key: form.cloudinary_api_key,
      channels: form.channels,
      jam_auto: form.jam_auto, auto_aktif: form.auto_aktif,
    };
    if (form.cloudinary_api_secret.trim()) body.cloudinary_api_secret = form.cloudinary_api_secret.trim();
    if (form.buffer_api_key.trim()) body.buffer_api_key = form.buffer_api_key.trim();
    if (form.zernio_api_key.trim()) body.zernio_api_key = form.zernio_api_key.trim();

    const r = await saveAgentAccount(characterId, body);
    setMenyimpan(false);
    if (r.success) {
      setMsg({ type: 'success', text: 'Kredensial tersimpan.' });
      setForm(f => f ? { ...f, cloudinary_api_secret: '', buffer_api_key: '', zernio_api_key: '' } : f);
      muat();
    } else setMsg({ type: 'error', text: r.error ?? 'Gagal menyimpan' });
  };

  const ambilAkun = async (characterId: number) => {
    setMemuatAkun(true); setMsg(null);
    const r = await getSchedulerAccounts(characterId);
    setMemuatAkun(false);
    if (!r.success || !r.data) { setMsg({ type: 'error', text: r.error ?? 'Gagal memuat daftar akun' }); return; }
    setAkunTertaut(r.data);
    // Isi otomatis dari daftar asli — provider tiap platform diambil dari API
    // mana yang MELAPORKANNYA, bukan dari pasangan tetap di kode. Akun Monica
    // menaruh Threads di Buffer & IG di Zernio; agent lain kebalikannya.
    setForm(f => {
      if (!f) return f;
      const channels: AgentChannels = { ...f.channels };
      for (const ch of r.data.buffer.channels ?? []) {
        if (PLATFORMS.includes(ch.service as SchedulerPlatform) && ch.id) {
          channels[ch.service as SchedulerPlatform] = { provider: 'buffer', id: ch.id };
        }
      }
      for (const ac of r.data.zernio.accounts ?? []) {
        if (ac.platform && PLATFORMS.includes(ac.platform as SchedulerPlatform) && ac.id) {
          channels[ac.platform as SchedulerPlatform] = { provider: 'zernio', id: ac.id };
        }
      }
      return { ...f, channels };
    });
  };

  const ubahChannel = (p: SchedulerPlatform, patch: Partial<{ provider: 'buffer' | 'zernio'; id: string }>) =>
    setForm(f => {
      if (!f) return f;
      const lama = f.channels[p] ?? { provider: 'buffer' as const, id: '' };
      const baru = { ...lama, ...patch };
      const channels = { ...f.channels };
      if (!baru.id.trim()) delete channels[p]; else channels[p] = baru;
      return { ...f, channels };
    });

  const namaUtama = items?.find(a => a.character_id === utama)?.nama ?? 'agent utama';

  // Ringkasan yang tampil saat kartu tertutup. Tanpa ini, saklar auto yang mati
  // atau agent yang bermasalah jadi tak terlihat sama sekali begitu diciutkan.
  const siap = items?.filter(a => a.storage_siap && a.scheduler_siap).length ?? 0;
  const perluPerhatian = items?.filter(a => a.auto_aktif && ((a.auto_hasil?.gagal ?? 0) > 0 || a.video_aktif === 0)).length ?? 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <button type="button" onClick={toggleCiut} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left">
        {ciut ? <ChevronRight size={16} className="text-[#94A3B8]" /> : <ChevronDown size={16} className="text-[#94A3B8]" />}
        <Users size={16} className="text-[#059669]" />
        <span className="text-sm font-semibold text-[#0F172A]">Akun Agent (Storage &amp; Scheduler)</span>
        {items && (
          <span className="text-[11px] text-[#64748B] truncate">
            {siap} siap · {mode === 'terpusat' ? 'Terpusat' : 'Per agent'} · auto {autoAktif ? 'AKTIF' : 'MATI'}
          </span>
        )}
        {perluPerhatian > 0 && (
          <span className="text-[11px] font-semibold text-amber-600">· {perluPerhatian} perlu perhatian</span>
        )}
        <span className="ml-auto" />
      </button>

      {!ciut && (
      <div className="px-5 pb-5 pt-1">

      {/* Saklar induk auto-jadwal. Ini MENGIRIM KE Buffer/Zernio pada jam dini
          hari; yang menerbitkan ke medsos tetap Buffer/Zernio di jam primetime. */}
      <div className={`rounded-xl border p-3 mb-3 ${autoAktif ? 'border-emerald-200 bg-emerald-50/60' : 'border-gray-100 bg-gray-50/60'}`}>
        <div className="flex items-center gap-3">
          <button type="button" disabled={ubahMode} onClick={() => gantiAuto(!autoAktif)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50 ${autoAktif ? 'bg-emerald-600' : 'bg-[#64748B]'}`}>
            {autoAktif ? <Pause size={13} /> : <Play size={13} />}
            {autoAktif ? 'Auto AKTIF — klik untuk jeda' : 'Auto MATI — klik untuk mulai'}
          </button>
          <p className="text-[10px] text-[#64748B] flex-1">
            Tiap agent dikirim ke Buffer/Zernio pada jamnya masing-masing (dini hari), sebanyak kuota hariannya.
            Yang menayangkan ke medsos tetap Buffer/Zernio, di jam primetime.
          </p>
        </div>
      </div>

      {/* Mode akun — menentukan akun SIAPA yang dipakai, mengatur storage DAN
          scheduler sekaligus. Ditaruh paling atas karena mengubah arti seluruh
          daftar di bawahnya. */}
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 mb-3">
        <div className="text-[11px] font-bold text-[#94A3B8] mb-1.5">MODE AKUN</div>
        <div className="flex flex-wrap gap-2">
          {([
            { v: 'terpusat' as ModeAkun, judul: 'Terpusat', ket: 'semua lewat akun agent utama' },
            { v: 'per_agent' as ModeAkun, judul: 'Per agent', ket: 'tiap agent pakai akunnya sendiri' },
          ]).map(o => (
            <button key={o.v} type="button" disabled={ubahMode} onClick={() => gantiMode(o.v)}
              className={`text-left px-3 py-2 rounded-xl border text-xs disabled:opacity-50 ${
                mode === o.v ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'bg-white text-[#334155] border-gray-200'
              }`}>
              <div className="font-semibold">{o.judul}</div>
              <div className={mode === o.v ? 'text-white/80' : 'text-[#94A3B8]'}>{o.ket}</div>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-[#64748B] mt-2">
          {mode === 'terpusat'
            ? `Upload & posting semua agent memakai akun ${namaUtama} — kredensial masing-masing di bawah tersimpan tapi belum dipakai. Aturan spesialis tidak berlaku.`
            : 'Tiap agent memakai akun & storage sendiri. Agent berspesialis hanya menerima jenis properti yang cocok; agent utama bebas semua jenis.'}
        </p>
      </div>

      {msg && (
        <div className={`rounded-xl p-3 mb-3 text-sm ${msg.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      {!items && <div className="text-sm text-[#94A3B8]">Memuat…</div>}

      <div className="space-y-2">
        {items?.map(a => {
          const terbuka = buka === a.character_id;
          return (
            <div key={a.character_id} className="border border-gray-100 rounded-xl overflow-hidden">
              <button type="button" onClick={() => bukaAgent(a)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left">
                <span className="font-semibold text-sm text-[#0F172A] capitalize">{a.nama}</span>
                <Lencana ok={a.storage_siap} teks={a.storage_siap ? 'Storage' : 'Storage global'} />
                <Lencana ok={a.scheduler_siap} teks={a.scheduler_siap ? 'Scheduler' : 'Scheduler kosong'} />
                {a.spesialis.length > 0 && (
                  <span className="text-[10px] text-[#64748B] capitalize">{a.spesialis.join(', ')}</span>
                )}
                <span className="text-[10px] text-[#64748B]">
                  {a.auto_aktif ? `auto ${a.jam_auto || '—'}` : 'auto mati'} · kuota {a.kuota}
                  {!a.utama && a.hari != null && ` · ${a.hari} hari nyata`}
                </span>
                <span className="ml-auto text-[10px] text-[#94A3B8]">{a.video_aktif} video</span>
              </button>

              {terbuka && form && (
                <div className="px-3 pb-3 pt-1 space-y-3 bg-gray-50/60">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className={LABEL_CLS}>Gmail akun</label>
                      <input className={INPUT_CLS} value={form.gmail} onChange={e => ubah('gmail', e.target.value)} placeholder="agent@gmail.com" />
                    </div>
                    <div>
                      <label className={LABEL_CLS}>Spesialis (kosong = semua jenis)</label>
                      <div className="flex flex-wrap gap-1">
                        {PROPERTY_TYPES.map(t => (
                          <button key={t.value} type="button" onClick={() => toggleSpesialis(t.value)}
                            className={`px-2 py-1 rounded-lg text-[11px] border ${form.spesialis.includes(t.value) ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'bg-white text-[#475569] border-gray-200'}`}>
                            {t.emoji} {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-1">
                    <div className="text-[11px] font-bold text-[#94A3B8] mb-1.5">STORAGE — CLOUDINARY</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className={LABEL_CLS}>Cloud name</label>
                        <input className={INPUT_CLS} value={form.cloudinary_name} onChange={e => ubah('cloudinary_name', e.target.value)} placeholder="dhb8b7nrd" />
                      </div>
                      <div>
                        <label className={LABEL_CLS}>API key</label>
                        <input className={INPUT_CLS} value={form.cloudinary_api_key} onChange={e => ubah('cloudinary_api_key', e.target.value)} placeholder="5234…" />
                      </div>
                      <div>
                        <label className={LABEL_CLS}>API secret</label>
                        <input className={INPUT_CLS} type="password" autoComplete="new-password" value={form.cloudinary_api_secret}
                          onChange={e => ubah('cloudinary_api_secret', e.target.value)}
                          placeholder={a.cloudinary_api_secret_masked ?? 'belum diisi'} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-bold text-[#94A3B8] mb-1.5">SCHEDULER — API KEY</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className={LABEL_CLS}>Buffer (YT Shorts, TikTok, Threads)</label>
                        <input className={INPUT_CLS} type="password" autoComplete="new-password" value={form.buffer_api_key}
                          onChange={e => ubah('buffer_api_key', e.target.value)} placeholder={a.buffer_api_key_masked ?? 'belum diisi'} />
                      </div>
                      <div>
                        <label className={LABEL_CLS}>Zernio (Facebook Pages, Instagram)</label>
                        <input className={INPUT_CLS} type="password" autoComplete="new-password" value={form.zernio_api_key}
                          onChange={e => ubah('zernio_api_key', e.target.value)} placeholder={a.zernio_api_key_masked ?? 'belum diisi'} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="text-[11px] font-bold text-[#94A3B8]">CHANNEL / ACCOUNT ID</div>
                      <button type="button" onClick={() => ambilAkun(a.character_id)} disabled={memuatAkun}
                        className="text-[11px] px-2 py-0.5 rounded-lg bg-white border border-gray-200 text-[#1565C0] font-semibold inline-flex items-center gap-1 disabled:opacity-50">
                        <RefreshCw size={11} className={memuatAkun ? 'animate-spin' : ''} /> Ambil dari API
                      </button>
                    </div>
                    {/* Provider dipilih PER PLATFORM — tiap akun berbeda pembagiannya,
                        jadi tidak boleh dipasangkan mati di kode (migrasi 0038). */}
                    <div className="space-y-1.5">
                      {PLATFORMS.map(p => {
                        const c = form.channels[p];
                        return (
                          <div key={p} className="flex items-center gap-2">
                            <span className="w-20 text-xs text-[#334155] shrink-0">{PLATFORM_LABEL[p]}</span>
                            <select value={c?.provider ?? 'buffer'} onChange={e => ubahChannel(p, { provider: e.target.value as 'buffer' | 'zernio' })}
                              className="px-2 py-2 rounded-xl border border-gray-200 text-xs shrink-0">
                              <option value="buffer">Buffer</option>
                              <option value="zernio">Zernio</option>
                            </select>
                            <input className={INPUT_CLS} value={c?.id ?? ''} placeholder="kosong = platform tidak dipakai"
                              onChange={e => ubahChannel(p, { id: e.target.value })} />
                          </div>
                        );
                      })}
                    </div>
                    {akunTertaut && (
                      <div className="mt-1.5 text-[10px] text-[#64748B]">
                        {akunTertaut.buffer.ok ? `Buffer: ${akunTertaut.buffer.channels?.length ?? 0} channel` : `Buffer: ${akunTertaut.buffer.error}`}
                        {' · '}
                        {akunTertaut.zernio.ok ? `Zernio: ${akunTertaut.zernio.accounts?.length ?? 0} akun` : `Zernio: ${akunTertaut.zernio.error}`}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-[11px] font-bold text-[#94A3B8] mb-1.5">AUTO-JADWAL AGENT INI</div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-[#334155]">
                        <input type="checkbox" checked={form.auto_aktif} onChange={e => ubah('auto_aktif', e.target.checked as never)} />
                        Aktifkan
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-[#334155]">
                        Jam kirim
                        {/* Daftar ini = jam yang BENAR-BENAR dijalankan cron
                            (workers/viralframe-purge-cron/wrangler.toml:
                            "0,30 18-21 UTC" = 01:00–04:30 WIB). Jam di luar itu
                            tersimpan rapi tapi tidak pernah menyala — 00:30
                            sempat ada di sini dan termasuk kasus itu. */}
                        <select value={form.jam_auto} onChange={e => ubah('jam_auto', e.target.value)}
                          className="px-2 py-1 rounded-lg border border-gray-200 text-xs">
                          <option value="">—</option>
                          {['01:00','01:30','02:00','02:30','03:00','03:30','04:00','04:30'].map(j => <option key={j} value={j}>{j} WIB</option>)}
                        </select>
                      </label>
                      {a.auto_terakhir && (
                        <span className="text-[10px] text-[#64748B]">
                          Terakhir: {new Date(a.auto_terakhir).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                          {a.auto_hasil && ` · ${a.auto_hasil.terjadwal} terjadwal${a.auto_hasil.gagal ? `, ${a.auto_hasil.gagal} gagal` : ''}${a.auto_hasil.alasan ? ` (${a.auto_hasil.alasan})` : ''}`}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button type="button" onClick={() => simpan(a.character_id)} disabled={menyimpan}
                      className="px-4 py-2 rounded-xl bg-[#1565C0] text-white text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
                      <Save size={14} /> {menyimpan ? 'Menyimpan…' : 'Simpan'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      </div>
      )}
    </div>
  );
}
