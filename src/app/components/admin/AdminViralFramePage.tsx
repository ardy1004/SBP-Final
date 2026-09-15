// VIRAL FRAME — MEJA KERJA.
//
// ─── Kenapa satu halaman menurun, bukan antrean ──────────────────────────────
// Versi sebelumnya berbentuk ANTREAN PRODUKSI: pilih banyak listing, masukkan
// antrean, tekan "Jalankan" berkali-kali, buka modal terpisah. Bentuk itu masuk
// akal untuk memproduksi puluhan video semalam tanpa melihat satu per satu.
// Tapi aturannya berbunyi "storyboard wajib bagus" — artinya setiap video
// DINILAI MANUSIA sebelum dirender, dan bentuk yang benar untuk itu adalah meja
// kerja: satu listing dikerjakan sampai tuntas sambil dilihat.
//
//   agent → listing → bahan → parameter → storyboard → prompt → caption → unggah
//
// ─── Yang TIDAK berubah: mesinnya ────────────────────────────────────────────
// Pesanan (`viralframe_orders`) tetap sumber kebenaran dan tetap menegakkan
// rotasi lewat UNIQUE(property_id, variation_key). Bedanya ia dibuat IMPLISIT
// saat "Buat Storyboard" ditekan, bukan lewat tombol "Antrekan" tersendiri.
// Ledger-nya tetap ada; yang hilang cuma antrean sebagai layar kerja.
import { bacaJson } from '../../../lib/api';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search, Filter, ImageOff, Video, ArrowLeft, Loader2, Sparkles,
  SlidersHorizontal, ChevronDown, ChevronUp, RotateCcw, Crown, Award, Flame, Star,
} from 'lucide-react';
import AgentGrid, { agentCocok, type AgentRow, type AgentStat } from './viralframe/AgentGrid';
import PanelBahan, { type Bahan, type DnaProduk } from './viralframe/PanelBahan';
import PanelStoryboard, { type HasilPesanan } from './viralframe/PanelStoryboard';
import PanelPrompt, { type PromptPart } from './viralframe/PanelPrompt';
import PanelUnggah from './viralframe/PanelUnggah';
import { FLOW, voDetikBaku } from '../../../../functions/_lib/viralframe.js';

interface PropertyRow {
  id: number;
  kode_listing: string;
  title: string;
  jenis_properti: string;
  tujuan: string;
  harga: number;
  status_publish: string;
  status_sold: number;
  badge_premium: number;
  badge_featured: number;
  badge_hot: number;
  properti_pilihan: number;
  provinsi: string;
  kabupaten: string;
  kecamatan: string;
  kelurahan: string;
  cover_url: string | null;
}

interface OrderRow {
  id: number;
  property_id: number;
  character_id: number;
  status: string;
  variation_key: string | null;
  catatan: string | null;
  video_id: number | null;
  title: string;
}

/** Bentuk lengkap satu pesanan hasil GET /orders/:id. */
interface OrderPenuh extends OrderRow {
  hasil: (HasilPesanan & { prompt_flow?: PromptPart[] }) | null;
}

const CTA_OPSI: { id: string; label: string }[] = [
  { id: 'survei',   label: 'Jadwalkan survei' },
  { id: 'wa',       label: 'Chat WhatsApp' },
  { id: 'dm_info',  label: 'DM untuk detail' },
  { id: 'link_bio', label: 'Klik link di bio' },
  { id: 'komentar', label: 'Komentar di bawah' },
  { id: 'simpan',   label: 'Simpan videonya' },
];

const PLATFORM_OPSI = ['tiktok', 'instagram', 'youtube', 'facebook'];

const BADGE_DEFS = [
  { key: 'pilihan',  label: 'Pilihan',  col: 'properti_pilihan', icon: Star,  color: '#F5A623' },
  { key: 'premium',  label: 'Premium',  col: 'badge_premium',    icon: Crown, color: '#7C3AED' },
  { key: 'featured', label: 'Featured', col: 'badge_featured',   icon: Award, color: '#1565C0' },
  { key: 'hot',      label: 'Hot',      col: 'badge_hot',        icon: Flame, color: '#EF4444' },
] as const;
type BadgeKey = typeof BADGE_DEFS[number]['key'];

function formatRupiahShort(n: number): string {
  if (!n) return 'Nego';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(n % 1_000_000_000 === 0 ? 0 : 1)} M`;
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)} Jt`;
  return n.toLocaleString('id-ID');
}

const JENIS_COLORS: Record<string, string> = {
  rumah: '#1565C0', kost: '#7C3AED', villa: '#10B981',
  tanah: '#F5A623', hotel: '#EF4444', apartment: '#0891B2',
  homestay: '#059669', gudang: '#78716C', komersial: '#DC2626',
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  published: { label: 'Published', cls: 'bg-emerald-100 text-emerald-700' },
  draft:     { label: 'Draft',     cls: 'bg-slate-100 text-slate-500' },
  sold:      { label: 'Sold',      cls: 'bg-red-100 text-red-600' },
  archived:  { label: 'Arsip',     cls: 'bg-gray-200 text-gray-500 line-through' },
};

function coverSrc(url: string | null) {
  if (!url) return null;
  if (url.startsWith('property-photos/') || url.startsWith('signatures/')) {
    return `/api/admin/media?key=${encodeURIComponent(url)}`;
  }
  return url;
}

// Stasiun mana yang sedang dikerjakan pesanan — dipakai sebagai label progres,
// bukan lagi badge antrean.
const LANGKAH: Record<string, string> = {
  baru: 'Menyiapkan', material: 'Menilai foto', variasi: 'Memilih variasi',
  konsep: 'Menyusun konsep', storyboard: 'Menyusun storyboard',
  menunggu_render: 'Siap dirender', selesai: 'Selesai', gagal: 'Gagal',
};

/** Batas iterasi loop stasiun. Listing 20 foto butuh ±4 lintasan Material + 2. */
const MAKS_LANGKAH = 8;

export default function AdminViralFramePage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentAktif, setAgentAktif] = useState<AgentRow | null>(null);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [displayLimit, setDisplayLimit] = useState(24);
  const [withVideo, setWithVideo] = useState<Set<number>>(new Set());
  const [onlyEmpty, setOnlyEmpty] = useState(false);

  // ── Meja kerja ────────────────────────────────────────────────────────────
  const [listingAktif, setListingAktif] = useState<PropertyRow | null>(null);
  const [bahan, setBahan] = useState<Bahan | null>(null);
  const [dnaSunting, setDnaSunting] = useState<DnaProduk | null>(null);
  const [order, setOrder] = useState<OrderPenuh | null>(null);
  const [progres, setProgres] = useState<string[]>([]);
  // Dinaikkan setiap kali pipeline selesai berjalan, supaya Panel Bahan memuat
  // ulang: stasiun Material mengisi vf_skor & vf_catatan SESUDAH panel itu
  // dimuat, dan tanpa ini layar terus bilang "belum dinilai" padahal datanya
  // sudah ada di database beberapa detik sebelumnya.
  const [bahanRefresh, setBahanRefresh] = useState(0);
  const [sibuk, setSibuk] = useState(false);
  const [kerjaError, setKerjaError] = useState('');

  // Lima parameter manual. Defaultnya diambil dari LAPIS KONSTANTA (kuota Flow),
  // bukan diketik ulang di sini — supaya tidak jadi sumber kebenaran kedua.
  const [jumlahPart, setJumlahPart] = useState<number>(FLOW.partPerVideo);
  const [detikPerPart, setDetikPerPart] = useState<number>(FLOW.detikPerPart);
  const [voDetik, setVoDetik] = useState<number>(voDetikBaku(FLOW.detikPerPart));
  const [cta, setCta] = useState('survei');
  const [platform, setPlatform] = useState('tiktok');
  // Faceless = pilihan per pesanan (keputusan user, BUKAN default) — video
  // properti tanpa talent/agent, ketiga slot ingredient dipakai foto properti.
  const [faceless, setFaceless] = useState(false);

  // ── Filter ────────────────────────────────────────────────────────────────
  const [filterOpen, setFilterOpen] = useState(false);
  const [jenisSet, setJenisSet] = useState<Set<string>>(new Set());
  const [provinsiFilter, setProvinsiFilter] = useState('');
  const [kabupatenFilter, setKabupatenFilter] = useState('');
  const [kecamatanFilter, setKecamatanFilter] = useState('');
  const [kelurahanFilter, setKelurahanFilter] = useState('');
  const [hargaMin, setHargaMin] = useState('');
  const [hargaMax, setHargaMax] = useState('');
  const [badgeSet, setBadgeSet] = useState<Set<BadgeKey>>(new Set());
  const [soldFilter, setSoldFilter] = useState<'all' | 'sold' | 'available'>('all');

  const toggleJenis = (j: string) => setJenisSet(prev => { const n = new Set(prev); n.has(j) ? n.delete(j) : n.add(j); return n; });
  const toggleBadge = (b: BadgeKey) => setBadgeSet(prev => { const n = new Set(prev); n.has(b) ? n.delete(b) : n.add(b); return n; });
  const activeFilterCount = jenisSet.size + badgeSet.size
    + (provinsiFilter ? 1 : 0) + (kabupatenFilter ? 1 : 0) + (kecamatanFilter ? 1 : 0) + (kelurahanFilter ? 1 : 0)
    + (hargaMin ? 1 : 0) + (hargaMax ? 1 : 0) + (soldFilter !== 'all' ? 1 : 0);
  const resetFilters = () => {
    setJenisSet(new Set());
    setProvinsiFilter(''); setKabupatenFilter(''); setKecamatanFilter(''); setKelurahanFilter('');
    setHargaMin(''); setHargaMax(''); setBadgeSet(new Set()); setSoldFilter('all');
  };
  const setProvinsi = (v: string) => { setProvinsiFilter(v); setKabupatenFilter(''); setKecamatanFilter(''); setKelurahanFilter(''); };
  const setKabupaten = (v: string) => { setKabupatenFilter(v); setKecamatanFilter(''); setKelurahanFilter(''); };
  const setKecamatan = (v: string) => { setKecamatanFilter(v); setKelurahanFilter(''); };

  const [orders, setOrders] = useState<OrderRow[]>([]);

  const refreshStatus = () => fetch('/api/admin/viralframe/status', { credentials: 'include' })
    .then(r => bacaJson<{ with_video?: number[] }>(r))
    .then(j => { if (j.success) setWithVideo(new Set(j.data?.with_video ?? [])); })
    .catch(() => {});

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/viralframe/orders?status=terbuka', { credentials: 'include' });
      const json = await bacaJson<{ items?: OrderRow[] }>(res);
      setOrders(json.data?.items ?? []);
    } catch {
      setOrders([]);
    }
  }, []);

  const fetchProperties = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/admin/properties', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await bacaJson(res);
      setProperties(json.data?.properties ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAgents = useCallback(async () => {
    setAgentsLoading(true);
    try {
      const res = await fetch('/api/admin/viralframe/characters', { credentials: 'include' });
      const json = await bacaJson(res);
      setAgents((json.data?.items ?? []) as AgentRow[]);
    } catch {
      setAgents([]);
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);
  useEffect(() => { fetchAgents(); }, [fetchAgents]);
  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => { refreshStatus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setDisplayLimit(24);
  }, [agentAktif, search, onlyEmpty, jenisSet, provinsiFilter, kabupatenFilter, kecamatanFilter, kelurahanFilter, hargaMin, hargaMax, badgeSet, soldFilter]);

  /** Muat satu pesanan LENGKAP (dengan hasil_json terurai). */
  const muatPesanan = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/admin/viralframe/orders/${id}`, { credentials: 'include' });
      const json = await bacaJson<OrderPenuh>(res);
      if (json.success && json.data) setOrder(json.data);
    } catch { /* biarkan state lama; user bisa menekan tombol lagi */ }
  }, []);

  // Pilih listing → reset seluruh state kerja, lalu sambung ke pesanan yang MASIH
  // TERBUKA untuk pasangan (listing, agent) ini kalau ada. Tanpa penyambungan itu,
  // menutup tab di tengah pekerjaan berarti storyboard yang sudah dibayar hilang
  // dari layar walau barisnya masih hidup di database.
  const pilihListing = useCallback((p: PropertyRow) => {
    setListingAktif(p);
    setOrder(null); setBahan(null); setDnaSunting(null);
    setProgres([]); setKerjaError('');
    const lama = orders.find(o => o.property_id === p.id && o.character_id === agentAktif?.id);
    if (lama) muatPesanan(lama.id);
  }, [orders, agentAktif, muatPesanan]);

  const paramsKirim = useCallback(() => ({
    jumlah_part: jumlahPart,
    detik_per_part: detikPerPart,
    vo_detik_per_part: voDetik,
    cta,
    platform,
    faceless,
    dna: dnaSunting ?? undefined,
  }), [jumlahPart, detikPerPart, voDetik, cta, platform, faceless, dnaSunting]);

  /**
   * Buat storyboard — cari/buat pesanan, lalu JALANKAN STASIUNNYA SENDIRI
   * sampai siap dirender.
   *
   * Loop-nya wajib, bukan kenyamanan: satu panggilan = satu stasiun karena
   * wall-clock Worker 30 detik, dan stasiun Material menilai 6 foto per lintasan
   * sehingga listing berfoto banyak butuh beberapa putaran. Dulu user yang
   * menekan "Jalankan" berulang kali; sekarang mesin yang mengulang dan user
   * cukup melihat progresnya.
   */
  const buatStoryboard = async () => {
    if (!listingAktif || !agentAktif || sibuk) return;
    setSibuk(true); setKerjaError(''); setProgres([]);
    try {
      let orderId = order?.id ?? null;

      // Pesanan yang sudah selesai TIDAK dipakai ulang — menekan tombol ini lagi
      // berarti minta VARIASI BARU, dan variasi baru butuh baris baru supaya
      // UNIQUE(property_id, variation_key) benar-benar menegakkan rotasi.
      if (order && (order.status === 'menunggu_render' || order.status === 'selesai')) orderId = null;

      if (orderId == null) {
        const res = await fetch('/api/admin/viralframe/orders', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            character_id: agentAktif.id,
            property_ids: [listingAktif.id],
            params: paramsKirim(),
          }),
        });
        const json = await bacaJson<{ ids?: (number | null)[] }>(res);
        if (!json.success) { setKerjaError(json.error ?? 'Gagal membuat pesanan.'); return; }
        orderId = json.data?.ids?.[0] ?? null;
        if (orderId == null) { setKerjaError('Pesanan dibuat tapi id-nya tidak terbaca.'); return; }
      } else {
        // Parameter & DNA suntingan bisa berubah sejak pesanan dibuat.
        await fetch(`/api/admin/viralframe/orders/${orderId}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ params: paramsKirim() }),
        });
      }

      for (let i = 0; i < MAKS_LANGKAH; i++) {
        const res = await fetch(`/api/admin/viralframe/orders/${orderId}/jalankan`, {
          method: 'POST', credentials: 'include',
        });
        const json = await bacaJson<{ pesan?: string; selesai?: boolean; status?: string }>(res);
        if (!json.success) {
          // Kegagalan MENGHENTIKAN loop. Mencoba ulang otomatis akan mengulang
          // kegagalan kuota AI delapan kali tanpa guna, dan menyembunyikan
          // sebabnya di balik tujuh percobaan berikutnya.
          setKerjaError(json.error ?? 'Stasiun gagal.');
          break;
        }
        setProgres(p => [...p, json.data?.pesan ?? 'Langkah selesai.']);
        if (json.data?.selesai) break;
        if (i === MAKS_LANGKAH - 1) {
          setKerjaError(`Berhenti setelah ${MAKS_LANGKAH} langkah — tekan "Buat Storyboard" lagi untuk melanjutkan.`);
        }
      }

      await muatPesanan(orderId);
      fetchOrders();
      setBahanRefresh(n => n + 1);
    } catch (err: unknown) {
      setKerjaError(err instanceof Error ? err.message : 'Gagal membuat storyboard.');
    } finally {
      setSibuk(false);
    }
  };

  /**
   * Batalkan pesanan yang sedang dibuka.
   *
   * ⚠️ Wajib ada. Kuota `MAKS_PESANAN_TERBUKA_PER_AGENT` menghitung pesanan
   * berstatus baru/material/variasi/konsep/storyboard/menunggu_render — jadi
   * lima pesanan yang mandek (mis. AI gagal berulang) mengunci agent itu
   * SELAMANYA tanpa jalan keluar di layar. Endpoint DELETE-nya sudah ada sejak
   * awal tapi kehilangan pemanggilnya saat antrean dibongkar jadi meja kerja.
   * Pesanan yang sudah menghasilkan video ditolak server, jadi tombol ini tidak
   * bisa dipakai membuang jejak video yang masih dipakai metrik.
   */
  const batalkanOrder = async () => {
    if (!order || sibuk) return;
    setSibuk(true); setKerjaError('');
    try {
      const res = await fetch(`/api/admin/viralframe/orders/${order.id}`, {
        method: 'DELETE', credentials: 'include',
      });
      const json = await bacaJson(res);
      if (!json.success) { setKerjaError(json.error ?? 'Gagal membatalkan pesanan.'); return; }
      setOrder(null); setProgres([]);
      fetchOrders();
    } catch (err: unknown) {
      setKerjaError(err instanceof Error ? err.message : 'Gagal membatalkan pesanan.');
    } finally {
      setSibuk(false);
    }
  };

  const contentStatus = (id: number): 'video' | 'empty' => (withVideo.has(id) ? 'video' : 'empty');

  const provinsiOptions = useMemo(
    () => [...new Set(properties.map(p => p.provinsi).filter(Boolean))].sort(), [properties]);
  const kabupatenOptions = useMemo(() => {
    const scoped = provinsiFilter ? properties.filter(p => p.provinsi === provinsiFilter) : properties;
    return [...new Set(scoped.map(p => p.kabupaten).filter(Boolean))].sort();
  }, [properties, provinsiFilter]);
  const kecamatanOptions = useMemo(() => {
    let s = properties;
    if (provinsiFilter) s = s.filter(p => p.provinsi === provinsiFilter);
    if (kabupatenFilter) s = s.filter(p => p.kabupaten === kabupatenFilter);
    return [...new Set(s.map(p => p.kecamatan).filter(Boolean))].sort();
  }, [properties, provinsiFilter, kabupatenFilter]);
  const kelurahanOptions = useMemo(() => {
    let s = properties;
    if (provinsiFilter) s = s.filter(p => p.provinsi === provinsiFilter);
    if (kabupatenFilter) s = s.filter(p => p.kabupaten === kabupatenFilter);
    if (kecamatanFilter) s = s.filter(p => p.kecamatan === kecamatanFilter);
    return [...new Set(s.map(p => p.kelurahan).filter(Boolean))].sort();
  }, [properties, provinsiFilter, kabupatenFilter, kecamatanFilter]);

  const agentStats = useMemo(() => {
    const out: Record<number, AgentStat> = {};
    for (const a of agents) {
      const cocok = properties.filter(p => agentCocok(a.spesialis, p.jenis_properti));
      out[a.id] = {
        total: cocok.length,
        adaKonten: cocok.filter(p => withVideo.has(p.id)).length,
        antre: orders.filter(o => o.character_id === a.id).length,
      };
    }
    return out;
  }, [agents, properties, withVideo, orders]);

  const filtered = properties.filter(p => {
    if (agentAktif && !agentCocok(agentAktif.spesialis, p.jenis_properti)) return false;
    if (onlyEmpty && contentStatus(p.id) !== 'empty') return false;
    if (jenisSet.size > 0 && !jenisSet.has(p.jenis_properti)) return false;
    if (provinsiFilter && p.provinsi !== provinsiFilter) return false;
    if (kabupatenFilter && p.kabupaten !== kabupatenFilter) return false;
    if (kecamatanFilter && p.kecamatan !== kecamatanFilter) return false;
    if (kelurahanFilter && p.kelurahan !== kelurahanFilter) return false;
    const min = parseInt(hargaMin, 10);
    const max = parseInt(hargaMax, 10);
    if (Number.isInteger(min) && min > 0 && p.harga < min) return false;
    if (Number.isInteger(max) && max > 0 && p.harga > max) return false;
    if (badgeSet.size > 0) {
      const hasAny = [...badgeSet].some(b => p[BADGE_DEFS.find(d => d.key === b)!.col] === 1);
      if (!hasAny) return false;
    }
    if (soldFilter === 'sold' && p.status_sold !== 1) return false;
    if (soldFilter === 'available' && p.status_sold === 1) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return p.title.toLowerCase().includes(q) || (p.kode_listing ?? '').toLowerCase().includes(q);
  });

  const totalWithContent = properties.filter(p => contentStatus(p.id) !== 'empty').length;
  const hasil = order?.hasil ?? null;
  const promptFlow = hasil?.prompt_flow ?? [];
  const siapDirender = order?.status === 'menunggu_render';

  // ─── LAYAR 1: pilih agent ─────────────────────────────────────────────────
  // Early return, bukan cabang di dalam JSX besar: seluruh hook sudah dipanggil
  // di atas baris ini, jadi urutannya tetap stabil di kedua layar.
  if (!agentAktif) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-xl font-bold text-[#0F172A] flex items-center gap-2">
            <Video size={20} className="text-[#1565C0]" /> Viral Frame
          </h1>
          <p className="text-[#64748B] text-sm mt-0.5">
            Pilih agent dulu — listing dikelompokkan per spesialisasi agent. Untuk jenis lain, pakai "Upload video manual" di Konten Agent.
          </p>
        </div>

        {!loading && properties.length > 0 && (
          <div className="bg-gradient-to-r from-[#1565C0] to-[#29B6F6] rounded-2xl p-4 text-white flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold">Produksi Konten Video</div>
              <div className="text-2xl font-bold">{totalWithContent}<span className="text-base font-normal">/{properties.length} listing</span></div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{properties.length ? Math.round((totalWithContent / properties.length) * 100) : 0}%</div>
              <div className="text-xs text-white/80">sudah ada konten</div>
            </div>
          </div>
        )}

        <AgentGrid agents={agents} stats={agentStats} onPilih={setAgentAktif} loading={agentsLoading || loading} />
      </div>
    );
  }

  // ─── LAYAR 2: meja kerja ──────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={() => { setAgentAktif(null); setListingAktif(null); setOrder(null); }}
          title="Kembali ke daftar agent"
          className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center text-[#64748B] hover:bg-gray-50 hover:text-[#0F172A] transition-colors shrink-0"
        >
          <ArrowLeft size={17} />
        </button>
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold text-[#0F172A] flex items-center gap-2 truncate">
            <Video size={20} className="text-[#1565C0] shrink-0" />
            {agentAktif.nama.replace(/\b\w/g, c => c.toUpperCase())}
          </h1>
          <p className="text-[#64748B] text-sm mt-0.5">
            {loading
              ? 'Memuat…'
              : `${(agentAktif.spesialis?.length ?? 0) === 0 ? 'Semua jenis properti' : `Spesialis ${agentAktif.spesialis!.join(', ')}`} — ${filtered.length} listing`}
          </p>
        </div>
      </div>

      {/* ─── LANGKAH 2: LISTING ─────────────────────────────────────────────
          Setelah satu listing dipilih, grid dilipat jadi satu baris. Tanpa itu
          user harus menggulir melewati 24 kartu setiap kali ingin menyentuh
          parameter di bawahnya. */}
      {listingAktif ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden shrink-0">
            {coverSrc(listingAktif.cover_url)
              ? <img src={coverSrc(listingAktif.cover_url)!} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-[#CBD5E1]"><ImageOff size={16} /></div>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-[#0F172A] truncate">{listingAktif.title}</div>
            <div className="text-[11px] text-[#94A3B8]">
              {listingAktif.kode_listing} · {listingAktif.kecamatan}, {listingAktif.kabupaten} · Rp {formatRupiahShort(listingAktif.harga)}
            </div>
          </div>
          {order && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EFF6FF] text-[#1E40AF] shrink-0">
              {LANGKAH[order.status] ?? order.status}
            </span>
          )}
          {order && order.video_id == null && (
            <button
              onClick={batalkanOrder}
              disabled={sibuk}
              title="Hapus pesanan ini — membebaskan kuota agent"
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-[#64748B] hover:bg-red-50 hover:text-red-600 hover:border-red-200 shrink-0 disabled:opacity-50">
              Batalkan
            </button>
          )}
          <button
            onClick={() => { setListingAktif(null); setOrder(null); setBahan(null); setDnaSunting(null); setProgres([]); setKerjaError(''); }}
            className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-[#64748B] hover:bg-gray-50 shrink-0">
            Ganti listing
          </button>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari judul atau kode listing…"
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] transition-colors"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => setOnlyEmpty(v => !v)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${onlyEmpty ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'bg-white text-[#64748B] border-gray-200 hover:bg-gray-50'}`}>
                ⬜ Belum ada konten {onlyEmpty ? '(aktif)' : ''}
              </button>
              <button onClick={() => setFilterOpen(v => !v)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5 ${filterOpen || activeFilterCount > 0 ? 'bg-[#0F172A] text-white border-[#0F172A]' : 'bg-white text-[#64748B] border-gray-200 hover:bg-gray-50'}`}>
                <SlidersHorizontal size={13} /> Filter
                {activeFilterCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">{activeFilterCount}</span>
                )}
                {filterOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              {activeFilterCount > 0 && (
                <button onClick={resetFilters} className="text-xs text-red-500 hover:underline flex items-center gap-1">
                  <RotateCcw size={12} /> Reset filter
                </button>
              )}
            </div>

            {filterOpen && (
              <div className="pt-3 border-t border-gray-100 space-y-4">
                <div>
                  <div className="text-xs font-semibold text-[#64748B] mb-1.5">Jenis Properti</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.keys(JENIS_COLORS).map(j => (
                      <button key={j} onClick={() => toggleJenis(j)}
                        className={`text-xs px-2.5 py-1 rounded-full border capitalize transition-colors ${jenisSet.has(j) ? 'text-white border-transparent' : 'bg-white text-[#64748B] border-gray-200 hover:bg-gray-50'}`}
                        style={jenisSet.has(j) ? { background: JENIS_COLORS[j] } : undefined}>
                        {j}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-[#64748B] mb-1.5">Rentang Harga (Rp)</div>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} value={hargaMin} onChange={e => setHargaMin(e.target.value)}
                      placeholder="Minimum" className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1565C0]" />
                    <span className="text-[#94A3B8] text-sm">–</span>
                    <input type="number" min={0} value={hargaMax} onChange={e => setHargaMax(e.target.value)}
                      placeholder="Maksimum" className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1565C0]" />
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-[#64748B] mb-1.5">Lokasi</div>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={provinsiFilter} onChange={e => setProvinsi(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1565C0] bg-white">
                      <option value="">Semua Provinsi</option>
                      {provinsiOptions.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <select value={kabupatenFilter} onChange={e => setKabupaten(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1565C0] bg-white">
                      <option value="">Semua Kab./Kota</option>
                      {kabupatenOptions.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <select value={kecamatanFilter} onChange={e => setKecamatan(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1565C0] bg-white">
                      <option value="">Semua Kecamatan</option>
                      {kecamatanOptions.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <select value={kelurahanFilter} onChange={e => setKelurahanFilter(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1565C0] bg-white">
                      <option value="">Semua Kel./Desa</option>
                      {kelurahanOptions.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-[#64748B] mb-1.5">Badge</div>
                  <div className="flex flex-wrap gap-1.5">
                    {BADGE_DEFS.map(({ key, label, icon: Icon, color }) => (
                      <button key={key} onClick={() => toggleBadge(key)}
                        className={`text-xs px-2.5 py-1 rounded-full border flex items-center gap-1 transition-colors ${badgeSet.has(key) ? 'text-white border-transparent' : 'bg-white text-[#64748B] border-gray-200 hover:bg-gray-50'}`}
                        style={badgeSet.has(key) ? { background: color } : undefined}>
                        <Icon size={11} /> {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-[#64748B] mb-1.5">Status Terjual</div>
                  <div className="flex gap-1.5">
                    {([['all', 'Semua'], ['available', 'Tersedia'], ['sold', '🔴 SOLD']] as const).map(([val, label]) => (
                      <button key={val} onClick={() => setSoldFilter(val)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${soldFilter === val ? 'bg-[#0F172A] text-white border-[#0F172A]' : 'bg-white text-[#64748B] border-gray-200 hover:bg-gray-50'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="p-4 text-sm text-red-600 bg-red-50 rounded-2xl border border-red-100">
              {error} — <button onClick={fetchProperties} className="underline font-medium">Coba lagi</button>
            </div>
          )}

          {loading && (
            <div className="py-12 text-center text-[#94A3B8] text-sm">
              <div className="w-6 h-6 border-2 border-[#1565C0]/20 border-t-[#1565C0] rounded-full animate-spin mx-auto mb-2" />
              Memuat data…
            </div>
          )}

          {!loading && !error && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.slice(0, displayLimit).map(p => {
                const badge = STATUS_BADGE[p.status_publish] ?? { label: p.status_publish, cls: 'bg-gray-100 text-gray-500' };
                const src = coverSrc(p.cover_url);
                const punyaVideo = contentStatus(p.id) === 'video';
                const antre = orders.filter(o => o.property_id === p.id).length;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pilihListing(p)}
                    className="text-left bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-[#1565C0] hover:shadow-md transition-all overflow-hidden flex flex-col"
                  >
                    <div className="relative w-full bg-gray-100" style={{ paddingBottom: '56.25%' }}>
                      {src ? (
                        <img src={src} alt={p.title} className="absolute inset-0 w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <ImageOff size={24} className="text-gray-300" />
                        </div>
                      )}
                      {p.status_sold === 1 && (
                        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                          <span className="px-4 py-1 rotate-[-8deg] bg-red-600 text-white text-sm font-extrabold tracking-wider rounded shadow-lg border-2 border-white">SOLD</span>
                        </div>
                      )}
                      <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-medium z-20 ${badge.cls}`}>{badge.label}</span>
                      <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold z-20 ${
                        antre > 0 ? 'bg-amber-400 text-amber-950'
                        : punyaVideo ? 'bg-emerald-500 text-white'
                        : 'bg-white/90 text-gray-500 border border-gray-200'}`}>
                        {antre > 0 ? `${antre} dikerjakan` : punyaVideo ? '🎬 Ada video' : '⬜ Belum'}
                      </span>
                    </div>
                    <div className="p-3 flex-1 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs px-1.5 py-0.5 rounded-full text-white font-semibold"
                          style={{ background: JENIS_COLORS[p.jenis_properti] ?? '#64748B', fontSize: '10px' }}>
                          {p.jenis_properti}
                        </span>
                        <span className="text-xs text-[#94A3B8] truncate">{p.kode_listing}</span>
                      </div>
                      <div className="font-medium text-[#0F172A] text-sm leading-snug line-clamp-2">{p.title}</div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-[#64748B] truncate">{p.kecamatan}, {p.kabupaten}</div>
                        <div className="text-xs font-semibold text-[#1565C0] whitespace-nowrap">Rp {formatRupiahShort(p.harga)}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="text-center py-12">
              <Filter size={32} className="text-[#E2E8F0] mx-auto mb-3" />
              <p className="text-[#64748B] text-sm">Tidak ada properti yang sesuai pencarian</p>
            </div>
          )}

          {!loading && filtered.length > displayLimit && (
            <div className="flex justify-center">
              <button onClick={() => setDisplayLimit(prev => prev + 24)}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
                Muat Lebih Banyak ({filtered.length - displayLimit} tersisa)
              </button>
            </div>
          )}
        </>
      )}

      {/* ─── LANGKAH 3-9: hanya setelah listing dipilih ───────────────────── */}
      {listingAktif && agentAktif && (
        <>
          <PanelBahan
            propertyId={listingAktif.id}
            characterId={agentAktif.id}
            refreshKey={bahanRefresh}
            onSiap={(b, d) => { setBahan(b); setDnaSunting(d); }}
          />

          {/* ─── LANGKAH 4: PARAMETER ───────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h2 className="font-display font-bold text-[#0F172A] text-sm mb-3">Parameter</h2>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              <label className="block">
                <span className="block text-[11px] font-medium text-[#64748B] mb-1">Talent</span>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setFaceless(false)}
                    title="Video memakai foto agent sebagai talent"
                    className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${!faceless ? 'bg-[#1565C0] text-white' : 'bg-white text-[#64748B] hover:bg-gray-50'}`}>
                    Dengan agent
                  </button>
                  <button
                    type="button"
                    onClick={() => setFaceless(true)}
                    title="Video properti tanpa talent — nol foto orang"
                    className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${faceless ? 'bg-[#1565C0] text-white' : 'bg-white text-[#64748B] hover:bg-gray-50'}`}>
                    Faceless
                  </button>
                </div>
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-[#64748B] mb-1">Total part</span>
                <select value={jumlahPart} onChange={e => setJumlahPart(parseInt(e.target.value, 10))}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1565C0] bg-white">
                  {[1, 2, 3].map(n => <option key={n} value={n}>{n} part</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-[#64748B] mb-1">Durasi / part</span>
                <select value={detikPerPart}
                  onChange={e => {
                    const d = parseInt(e.target.value, 10);
                    setDetikPerPart(d);
                    // VO ikut turun kalau melebihi durasi klip yang baru — nilai VO
                    // lebih besar dari klipnya mustahil dan hanya akan dipotong server.
                    setVoDetik(v => (v > d ? voDetikBaku(d) : v));
                  }}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1565C0] bg-white">
                  {[6, 8, 10].map(n => <option key={n} value={n}>{n} detik</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-[#64748B] mb-1">Voiceover / part</span>
                <select value={voDetik} onChange={e => setVoDetik(parseInt(e.target.value, 10))}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1565C0] bg-white">
                  {Array.from({ length: detikPerPart - 1 }, (_, i) => i + 2).map(n => (
                    <option key={n} value={n}>{n} detik</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-[#64748B] mb-1">Call to action</span>
                <select value={cta} onChange={e => setCta(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1565C0] bg-white">
                  {CTA_OPSI.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block text-[11px] font-medium text-[#64748B] mb-1">Platform</span>
                <select value={platform} onChange={e => setPlatform(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1565C0] bg-white capitalize">
                  {PLATFORM_OPSI.map(o => <option key={o} value={o} className="capitalize">{o}</option>)}
                </select>
              </label>
            </div>
            <p className="text-[11px] text-[#94A3B8] mt-2.5">
              {jumlahPart} × {detikPerPart} detik = {jumlahPart * detikPerPart} detik total ·
              voiceover {voDetik} detik/part ≈ {Math.round(voDetik * 2.5)} kata ·
              {faceless ? ' faceless — properti tanpa talent ·' : ` agent ${agentAktif.nama} ·`}
              gaya, sudut cerita, dan pilihan foto diputuskan AI.
            </p>
            {/* Kombinasi 1 Part memaksa hook + isi + ajakan masuk ke satu anggaran
                kata. Kedua pesanan nyata pertama melanggarnya (satu kelebihan 8
                kata), jadi batasnya disebutkan sebelum ditekan, bukan sesudah. */}
            {jumlahPart === 1 && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mt-1.5">
                Satu Part berarti kail, isi, dan ajakan harus muat dalam{' '}
                <b>{Math.round(voDetik * 2.5)} kata</b> — sangat ketat. Naikkan ke 2–3 Part
                kalau ingin ruang bercerita.
              </p>
            )}

            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 flex-wrap">
              <button
                onClick={buatStoryboard}
                disabled={sibuk || !bahan}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
                {sibuk ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {sibuk ? 'Memproses…' : siapDirender ? 'Buat storyboard baru (rotasi berikutnya)' : 'Buat storyboard'}
              </button>
              {bahan && (
                <span className="text-[11px] text-[#94A3B8]">
                  Rotasi ke-{bahan.rotasi.sudah + 1}
                  {bahan.rotasi.maks ? ` dari ${bahan.rotasi.maks}` : ''} · variasi dipilih sistem, bukan AI
                </span>
              )}
            </div>

            {progres.length > 0 && (
              <ul className="mt-3 space-y-1">
                {progres.map((t, i) => (
                  <li key={i} className="text-[11px] text-[#64748B] flex gap-1.5">
                    <span className="text-emerald-600">✓</span> {t}
                  </li>
                ))}
              </ul>
            )}
            {kerjaError && (
              <div className="mt-3 bg-red-50 border border-red-100 text-red-700 rounded-xl px-3 py-2 text-xs">{kerjaError}</div>
            )}
          </div>

          {/* ─── LANGKAH 5-6: STORYBOARD + RETENTION CHECK + ADU HOOK ───── */}
          {hasil && order && (
            <PanelStoryboard orderId={order.id} hasil={hasil} onUbah={() => muatPesanan(order.id)} />
          )}

          {/* ─── LANGKAH 7: PROMPT GOOGLE FLOW ──────────────────────────── */}
          {promptFlow.length > 0 && (
            <PanelPrompt parts={promptFlow} faceless={hasil?.params?.faceless ?? faceless} />
          )}

          {/* ─── LANGKAH 8-9: CAPTION + HASHTAG + UNGGAH ─────────────────
              Caption dulu berupa kartu TERPISAH di atas panel unggah, dan itu
              salah dua kali: tombolnya jauh dari kolom yang diisinya, dan
              hasilnya dioper lewat prop ke `useState` yang hanya membaca sekali
              saat mount — jadi caption yang dibuat setelah panel terpasang tidak
              pernah sampai ke kolomnya. Sekarang tombolnya di dalam panel dan
              mengisi state-nya langsung; tidak ada jalur data yang bisa putus. */}
          {siapDirender && order && (
            <PanelUnggah
              order={{ id: order.id, property_id: order.property_id, character_id: order.character_id, title: order.title }}
              captionAwal={hasil?.caption?.teks ?? ''}
              hashtagAwal={hasil?.caption?.hashtags ?? ''}
              onSelesai={() => { fetchOrders(); refreshStatus(); muatPesanan(order.id); }}
            />
          )}
        </>
      )}
    </div>
  );
}
