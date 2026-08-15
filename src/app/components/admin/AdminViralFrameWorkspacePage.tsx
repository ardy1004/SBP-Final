import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, Link } from 'react-router';
import {
  ArrowLeft, ArrowRight, ImageOff, Check, Film, AlertCircle,
  Copy, Download, Loader2, FileCheck2, FileArchive, X, Sparkles, History, Trash2, RefreshCw, Upload, Music, Captions,
  ChevronDown,
} from 'lucide-react';
// JSZip di-dynamic-import di handler (bukan static) agar tidak masuk chunk awal workspace.
import {
  AI_TOOLS, RATIOS, LANGUAGES, HOOK_TYPES, CTA_TYPES, VISUAL_STYLES,
  TONES, PLATFORMS, PHOTO_LABELS, LANGUAGE_REGISTERS, REGISTER_INSTRUCTION,
  characterFileName, AI_TOOL_FORMAT_SPEC,
  isNativeAudioTool, getClipMaxSec, namaFileKarakter, PLATFORM_BEHAVIOR,
  totalDurationOfParts, CTA_SPOKEN_EXAMPLE,
  konversiDraftLama, normalisasiParts, buildZipNames, slugifyLabel, MAX_REF_IMAGES_PER_PART,
  RULEBOOK_VERSION,
  type PartDef, type ZipSourceImage,
  type DraftLamaS1, type DraftLamaScene,
} from './viralframe/options';
import CharacterStepBase, { type Step3State } from './viralframe/CharacterStep';
import BacksoundPicker, { backsoundMediaUrl, type BacksoundItem } from './viralframe/BacksoundPicker';
import LabelFotoStep from './viralframe/LabelFotoStep';
import { readNdjsonFinal } from '../../../lib/ndjson';
// #2: memoize komponen anak agar tak re-render saat parent re-render tanpa perubahan prop.
const CharacterStep = memo(CharacterStepBase);
import { ARCHETYPES, findArchetype, ARCHETYPE_CUSTOM_ID, compileCameraChoreography } from './viralframe/archetypes';
import { cfImg } from '../../../lib/img';
import { getAiModels, getAiStatus, type AiProviderId, type AiStatusInfo, bacaJson } from '../../../lib/api';

const AI_PROVIDER_LIST: { id: AiProviderId; label: string }[] = [
  { id: 'gemini', label: 'Gemini' },
  { id: 'groq', label: 'Groq' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'deepseek', label: 'DeepSeek' },
];
const AI_STATUS_COLOR: Record<'green' | 'yellow' | 'red', string> = { green: '#10B981', yellow: '#F59E0B', red: '#EF4444' };

// Durasi klip default per platform (selaras dgn PLATFORM_DURASI di ai-generate.js) —
// hanya untuk menghitung jumlah beat koreografi kamera Jalur C.
const PLATFORM_DURASI_VF: Record<string, number> = { tiktok: 8, ig_reels: 8, yt_shorts: 10, fb_reels: 8 };
import {
  PLATFORM_OPTIONS, MUSIK_OPTIONS, MUSIK_ROTASI_VALUES, FOTO_LABEL_OPTIONS,
} from '../../lib/viralframe-constants';
import { compileMasterPrompt, compileNaturalPrompt, estimateTokens, buildProductionNotes, buildCharacterDescription } from './viralframe/masterPromptCompiler';
import { validatePartJson, partPromptText, type ParsedJSON, type ValidateResult } from './viralframe/jsonValidator';
import PartCardsBase from './viralframe/SceneCards';
const PartCards = memo(PartCardsBase);

// Debounce nilai — dipakai menunda kompilasi Master Prompt saat mengetik (#1).
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Tipe data ────────────────────────────────────────────────────────────
interface PropertyImage { id: number; url_webp: string; alt_text: string | null; urutan: number; is_cover: number;
  /** Label ruangan tersimpan (migrasi 0026) — dipakai sebagai nilai awal step Foto per Scene & YouTube Long. */
  label_ruangan?: string | null }
interface PropertyDetail {
  id: number; kode_listing: string; title: string;
  jenis_properti: string; tujuan: string; harga: number;
  kecamatan: string; kabupaten: string; provinsi: string;
  deskripsi: string | null;
  jumlah_kamar_tidur: number | null; jumlah_kamar_mandi: number | null;
  luas_tanah: number | null; luas_bangunan: number | null;
  legalitas: string | null;
  images: PropertyImage[];
}

interface Step1State {
  platforms: string[];          // urut; index 0 = primer
  aiTool: string;
  ratio: string;
  language: string;
  hookType: string;
  ctaType: string;
  ctaKeyword: string;
  visualStyle: string;
  tone: string;
  niche: string;                // fixed 'real_estate'
  archetype: string;            // id VideoArchetype ('custom' = manual)
  register: string;             // gaya bahasa dialog (auto/formal/santai/gaul/jawa_halus)
  // Nomor PART (1-based, BUKAN lagi scene — refactor Part-as-Generate-Unit
  // 2026-08-01) yang DIKECUALIKAN dari pola cutaway B-roll arketipe hybrid
  // (agent_broll_hybrid/selfie_luxury_hybrid) — Part itu jadi talking-head/selfie
  // penuh durasi tanpa cutaway. Hanya relevan bila archetype.allowMultiShotPerScene.
  cutawayExcluded: number[];
  /** Unit generate — 1 Part = 1 panggilan generate (model Part-as-Generate-Unit,
   * refactor 2026-08-01, lihat PartDef di options.ts). SATU-SATUNYA sumber
   * struktur & durasi — mode durasi lama (uniform/manual/sceneCount) DIHAPUS.
   * Draft/riwayat lama ({s1:{durationMode,sceneCount,...}, scenes:[]}) dikonversi
   * lewat konversiDraftLama() di applyConfig(), bukan dibaca langsung di sini. */
  parts: PartDef[];
}

const ACCENT = '#1565C0';

function mediaSrc(url: string | null) {
  if (!url) return null;
  if (url.startsWith('property-photos/') || url.startsWith('signatures/')) {
    return `/api/admin/media?key=${encodeURIComponent(url)}`;
  }
  return url;
}

// Thumbnail teroptimasi untuk grid: foto publik (property/karakter) disajikan via
// endpoint publik /api/media + Cloudflare resize (cfImg) → download & decode jauh
// lebih ringan (fix scroll jank). Foto privat fallback ke mediaSrc.
function thumbSrc(url: string | null, width: number): string {
  if (!url) return '';
  if (url.startsWith('property-photos/') || url.startsWith('viralframe-characters/')) {
    return cfImg(`/api/media?key=${encodeURIComponent(url)}`, width);
  }
  return mediaSrc(url) ?? '';
}

// Font untuk Auto Caption (drawtext ffmpeg) — TTF statis di public/fonts/,
// TERPISAH dari WOFF2 yang dipakai UI web biasa (freetype build ffmpeg.wasm
// ini tidak bisa decode WOFF2, reproduced live 2026-07-28). Pola sama CapCut:
// tiap pilihan gaya cuma file font statis, tidak menyentuh anggaran CPU/bundle.
const CAPTION_FONTS = {
  inter: { label: 'Inter', file: '/fonts/inter-caption.ttf' },
  poppins: { label: 'Poppins Bold', file: '/fonts/poppins-caption.ttf' },
  montserrat: { label: 'Montserrat', file: '/fonts/montserrat-caption.ttf' },
} as const;

// R8: bangun subtitle .SRT dari narasi per scene + durasi (timing kumulatif).
function srtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))},${p(ms % 1000, 3)}`;
}
// Subtitle .SRT per PART (bukan lagi per scene, refactor 2026-08-01) — timing
// kumulatif dari duration_sec tiap Part, teks dari field "dialog" Part.
function buildSrtFromParts(parts: { dialog?: string; duration_sec?: number }[]): string {
  let t = 0; const out: string[] = []; let idx = 1;
  parts.forEach(p => {
    const dur = Number(p.duration_sec) > 0 ? Number(p.duration_sec) : 6;
    const text = (p.dialog ?? '').trim();
    if (text) { out.push(String(idx++), `${srtTime(t)} --> ${srtTime(t + dur)}`, text, ''); }
    t += dur;
  });
  return out.join('\n');
}

// Baca respons streaming NDJSON dari endpoint AI (heartbeat tiap 2s + baris
// terakhir {done, data|error}) — pola anti wall-clock 30s Worker. Error validasi
// awal (4xx) tetap JSON biasa, dibedakan via content-type.
// Pembaca NDJSON dipindah ke src/lib/ndjson.ts agar dipakai bersama dengan
// AdminPropertyDetailPage (AI Generate Deskripsi & SEO) — jangan duplikasi lagi.

// ─── Komponen kecil ────────────────────────────────────────────────────────
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#0F172A] mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-[#94A3B8] mt-1">{hint}</p>}
    </div>
  );
}

const selectCls =
  'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] bg-white transition-colors';

// Dropdown label dengan kotak pencarian (combobox) — untuk daftar label yang panjang.
function LabelSelect({ value, onChange, options, placeholder = '— Pilih label —' }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  // Posisi menu (fixed, relatif viewport) — menu dirender via portal ke <body>
  // agar tidak terpotong ancestor ber-overflow (kartu scene / scroll container AdminLayout).
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const MENU_H = 300; // perkiraan tinggi maksimum menu (search box + list max-h-52)

  const place = useCallback(() => {
    const btn = ref.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const up = spaceBelow < MENU_H && r.top > spaceBelow; // buka ke atas bila ruang bawah sempit
    setPos({ top: up ? r.top : r.bottom, left: r.left, width: r.width, up });
  }, []);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', h);
    // Ikuti scroll/resize supaya menu tetap menempel pada tombol
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', h);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  const filtered = options.filter(o => o.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => { setQ(''); if (!open) place(); setOpen(o => !o); }}
        className={`${selectCls} text-left flex items-center justify-between gap-2`}>
        <span className={value ? 'text-[#0F172A] truncate' : 'text-[#94A3B8]'}>{value || placeholder}</span>
        <span className="text-[#94A3B8] text-xs flex-shrink-0">▼</span>
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div ref={menuRef}
          className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
          style={{
            left: pos.left,
            width: pos.width,
            ...(pos.up ? { bottom: window.innerHeight - pos.top + 4 } : { top: pos.top + 4 }),
          }}>
          <div className="p-2 border-b border-gray-100">
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Cari label…"
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-[#1565C0]" />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && <div className="px-3 py-2 text-xs text-[#94A3B8]">Tidak ada hasil</div>}
            {filtered.map(o => (
              <button key={o} type="button" onClick={() => { onChange(o); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-[#F0F7FF] ${o === value ? 'text-[#1565C0] font-semibold bg-[#EFF6FF]' : 'text-[#0F172A]'}`}>{o}</button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function Select({ value, onChange, opts }: {
  value: string; onChange: (v: string) => void; opts: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={selectCls}>
      {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// Judul section wizard — SATU sumber, dipakai StepIndicator dan header <Section>
// agar keduanya tidak pernah menyebut nama berbeda untuk step yang sama.
const SECTION_TITLES = [
  'Label Foto',
  'Pilih Karakter',
  'Pilih Mode',
  'Parameter Video',
  'Generate Prompt',
];

function StepIndicator({ current, done, onJump }: {
  current: number;
  /** Section yang validasinya sudah lolos — dicentang di bar. */
  done: (n: number) => boolean;
  onJump: (n: number) => void;
}) {
  const steps = SECTION_TITLES.map((label, n) => ({ n, label, enabled: true }));
  return (
    <div className="flex items-center">
      {steps.map((s, i) => {
        const selesai = done(s.n);
        const active = current === s.n;
        return (
          <div key={s.n} className="flex items-center flex-1 last:flex-none">
            <button type="button" onClick={() => onJump(s.n)}
              className="flex flex-col items-center group" title={`Buka: ${s.label}`}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  active || selesai ? 'text-white' : 'text-[#64748B] bg-gray-100 group-hover:bg-gray-200'
                }`}
                style={active || selesai ? { background: ACCENT } : undefined}
              >
                {selesai && !active ? <Check size={15} /> : s.n + 1}
              </div>
              <span className={`mt-1.5 text-[11px] font-medium text-center leading-tight max-w-[80px] ${
                active ? 'text-[#0F172A]' : 'text-[#94A3B8] group-hover:text-[#64748B]'
              }`}>
                {s.label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <div className="flex-1 h-0.5 mx-1 mb-5 rounded" style={{ background: selesai ? ACCENT : '#E2E8F0' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Tombol Kembali/Lanjut di kaki tiap section accordion. */
function SectionNav({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center justify-between pt-1">
      <button onClick={onBack}
        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-[#64748B] border border-gray-200 hover:bg-gray-50 transition-colors">
        <ArrowLeft size={15} /> Kembali
      </button>
      <button onClick={onNext}
        className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
        Lanjut <ArrowRight size={15} />
      </button>
    </div>
  );
}

/**
 * Satu langkah wizard sebagai panel accordion. Sejak 2026-08-01 wizard TIDAK lagi
 * mengganti isi layar per step — semua section bertumpuk di satu halaman, step
 * berikutnya muncul DI BAWAH, dan tiap section bisa dibuka/ditutup lewat header.
 * Header selalu terlihat walau section tertutup, jadi user bisa melompat mundur
 * tanpa kehilangan konteks step yang sudah diisi.
 */
function Section({ n, title, open, done, onToggle, children, footer }: {
  n: number; title: string; open: boolean; done: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <button type="button" onClick={onToggle}
        aria-expanded={open}
        className={`w-full flex items-center gap-3 p-4 text-left transition-colors ${open ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
          open || done ? 'text-white' : 'text-[#64748B] bg-gray-100'
        }`} style={open || done ? { background: ACCENT } : undefined}>
          {done && !open ? <Check size={14} /> : n + 1}
        </span>
        <span className="font-display font-bold text-[#0F172A] flex-1 min-w-0">{title}</span>
        {done && <span className="text-[11px] font-semibold text-emerald-600 shrink-0">Lengkap</span>}
        <ChevronDown size={18} className={`text-[#94A3B8] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="p-5 pt-4 border-t border-gray-100 space-y-5">
          {children}
          {footer}
        </div>
      )}
    </div>
  );
}

// ─── Jalur C: AI Generate component ─────────────────────────────────────────
// Konstanta (PLATFORM_OPTIONS, MUSIK_OPTIONS,
// FOTO_LABEL_OPTIONS) diimport dari ../../lib/viralframe-constants — sumber
// tunggal yang sama dipakai step Foto & Parameter agar value enum tidak divergen lagi.

/** Satu PART hasil Jalur C = satu panggilan generate video (bukan lagi satu scene). */
interface AIScene {
  part: number; kamera: string; prompt: string; dialog_karakter: string;
  /** ⚠️ Bentuk ganda (2026-08-04): backend/AI SEHARUSNYA mengirim string[]
   * sekarang (satu kanal per teks overlay), tapi draft lama di localStorage
   * (vf_draft_*) dan riwayat D1 (viralframe_generations.params_json) masih
   * berbentuk string tunggal — SELALU baca lewat toleransi dua bentuk (lihat
   * getOnScreenTextArray() di bawah), jangan asumsikan salah satu bentuk saja.
   * Sama persis pola bug layar putih 2026-08-01 (readNdjsonFinal<T> = cast
   * tanpa validasi, ketidakcocokan bentuk lolos typecheck). */
  on_screen_text?: string | string[]; role?: string | null;
  /** INTENT AKTING Part ini — "kenapa dia bicara begini", mis. "she feels like she
   * is sharing a hidden gem discovery with her followers". BUKAN mode presenter
   * (talking-head/voiceover/selfie) — itu sudah ditetapkan arketipe. Makna ini
   * WAJIB sama dengan field `presentation` di masterPromptCompiler BLOK 5 &
   * ai-generate.js [9]: renderer-nya dipakai bersama. */
  presentation?: string;
  durasi_detik?: number | null; vo_durasi_detik?: number | null;
  /** Hanya untuk tool ber-audio native (Veo/Flow) — disuntik server, lihat ai-generate.js. */
  negative_prompt?: string; max_clip_sec?: number | null;
  /** Potongan visual DI DALAM satu generate call. Menggantikan `sequences` lama:
   * foto BOLEH berganti antar cut karena semua referensinya dilampirkan sekaligus. */
  cuts?: { t?: string; photo?: string; foto_label?: string; durasi?: number; action?: string; gesture?: string; emotion?: string }[];
  /** Nama file yang WAJIB dilampirkan user di Google Flow (identik dgn isi ZIP). */
  reference_images?: string[]; character_reference?: string;
}

/** Toleran dua bentuk on_screen_text (string tunggal lama vs string[] baru) —
 * WAJIB dipakai di setiap tempat yang membaca field ini. Lihat catatan di
 * interface AIScene di atas untuk alasan lengkapnya. */
function getOnScreenTextArray(v: string | string[] | null | undefined): string[] {
  if (Array.isArray(v)) return v.filter(t => typeof t === 'string' && t.trim().length > 0);
  if (typeof v === 'string' && v.trim().length > 0) return [v];
  return [];
}
interface AIKarakter { nama: string; deskripsi: string; foto_url: string }
interface AIMetadata {
  platform: string; ai_tool: string; bahasa: string; musik_value: string;
  judul_properti: string; kode_listing: string; generated_at: string;
  provider_used?: string; model_used?: string; provider_requested?: string; fell_back?: boolean;
}
// ⚠️ Nama field WAJIB cocok dengan yang dikirim functions/api/admin/viralframe/
// ai-generate.js → `send({done:true, data:{ parts, foto_urls, karakter, metadata }})`.
// Field ini pernah bernama `scenes` di sini sementara backend sudah mengirim
// `parts` (refactor Part-as-Generate-Unit) — typecheck TIDAK menangkapnya karena
// readNdjsonFinal<T>() adalah cast tanpa validasi, dan akibatnya seluruh halaman
// jadi layar putih begitu user menekan Generate (insiden 2026-08-01).
// Kalau mengubah nama di salah satu sisi, ubah SEKARANG JUGA di sisi lain.
interface AIGeneratedResult { parts: AIScene[]; foto_urls: string[]; karakter: AIKarakter; metadata: AIMetadata }

/** Penjaga runtime untuk batas NDJSON — readNdjsonFinal<T>() hanya meng-cast,
 *  tidak memverifikasi. Tanpa ini, ketidakcocokan kontrak muncul sebagai
 *  "Cannot read properties of undefined" saat render (layar putih), bukan sebagai
 *  pesan error yang bisa dimengerti. */
function pastikanHasilGenerate(data: unknown): AIGeneratedResult {
  const d = data as Partial<AIGeneratedResult> | null;
  if (!d || !Array.isArray(d.parts)) {
    throw new Error(
      'Respons AI tidak sesuai kontrak: field "parts" tidak ditemukan. '
      + 'Ini bug integrasi frontend↔backend, bukan kesalahan input — laporkan ke pengembang.'
    );
  }
  return d as AIGeneratedResult;
}

// Bridge step Foto (PHOTO_LABELS, Title Case) → FOTO_LABEL_OPTIONS (snake_case)
// agar step Foto tidak perlu diubah tapi tetap bisa dipakai AIGenerateTab.
const PHOTO_LABEL_TO_FOTO_LABEL: Record<string, string> = {
  'Fasad': 'fasad',
  'Foyer/Lobby': 'foyer',
  'Ruang Tamu': 'ruang_tamu',
  'Ruang Keluarga': 'ruang_santai',
  'Ruang Makan': 'ruang_makan',
  'Kamar Tidur': 'kamar_tidur',
  'Walk-in Closet': 'walk_in_closet',
  'Kamar Mandi': 'kamar_mandi',
  'Dapur': 'dapur',
  'Ruang Cuci/Jemur': 'laundry',
  'Ruang Kerja/Study': 'ruang_kerja',
  'Gym/Fitness': 'gym',
  'Koridor/Tangga': 'koridor_tangga',
  'Void/Plafon Tinggi': 'void',
  'Taman/Halaman': 'taman',
  'Carport/Garasi': 'parkir',
  'Balkon/Teras': 'balkon',
  'Rooftop': 'rooftop',
  'Kolam Renang': 'kolam_renang',
  'Musholla': 'musholla',
  'Gudang': 'gudang',
  'Ruang Usaha': 'ruang_usaha',
  'Tampak Lokasi/Lingkungan': 'view_sekitar',
  'Lainnya': 'lainnya',
};

// Bridge Parameter Video (s1.language: id/en/id_en/en_id/jw) → bahasa dialog_karakter DeepSeek
// (Indonesia/English/Jawa) — satu sumber (Step 3 Parameter), bukan input terpisah di AIGenerateTab.
// Bilingual (id_en/en_id) di-map ke Indonesia karena field dialog DeepSeek cuma menerima 1 bahasa.
function mapLanguageToBahasa(lang: string): string {
  switch (lang) {
    case 'en': return 'English';
    case 'jw': return 'Jawa';
    default: return 'Indonesia';
  }
}

interface ScenePhoto { foto_url: string; label: string }
interface AISelectedKarakter { id: number; nama: string; deskripsi: string; foto_url: string; expression: string }

// ─── Jalur C (ai-generate.js) — kontrak PART ─────────────────────────────────
// Sejak refactor Part-as-Generate-Unit (2026-08-01): 1 Part = 1 panggilan generate
// video, `cuts[]` = potongan visual DI DALAM generate itu, dan `foto_file` = nama
// file PERSIS seperti di ZIP (buildZipNames()) supaya user tahu file mana yang
// dilampirkan di Google Flow.
export interface PartCutForAI {
  foto_url: string;
  foto_label: string;
  /** Nama file di ZIP — WAJIB identik dengan yang disebut prompt. */
  foto_file: string;
  durasi: number;
}
export interface PartSpecForAI {
  part: number;
  role: 'Hook' | 'Body' | 'CTA';
  durasi: number;
  vo_durasi: number;
  label?: string;
  cuts: PartCutForAI[];
}

interface AIGenerateTabProps {
  propertyId: number;
  propertyTitle: string;
  kodeListingStr: string;
  /** Rancangan Part siap-kirim (1 Part = 1 generate call). */
  partSpecs: PartSpecForAI[];
  platform: string;
  platforms: string[];
  aiTool: string;
  ratio: string;
  bahasa: string;
  tone: string;
  visualStyle: string;
  hookType: string;
  ctaType: string;
  archetype: string;
  register: string;
  /** Nomor PART yang dikecualikan dari cutaway arketipe hybrid. */
  cutawayExcluded: number[];
  // Data dari Step 2 (Pilih Karakter)
  selectedKarakter: AISelectedKarakter | null;
  // Navigasi balik ke step yang belum lengkap
  onEditStep: (step: number) => void;
  /** Resolver musik mode 'auto' (least-recently-used). Dikirim dari induk karena
   *  riwayat generate (`history`) hidup di sana, bukan di tab ini. */
  pilihMusikRotasi: () => string;
}

function AIGenerateTab({
  propertyId, propertyTitle, kodeListingStr, partSpecs, platform, platforms, aiTool, bahasa,
  ratio, tone, visualStyle, hookType, ctaType, archetype, register, cutawayExcluded,
  selectedKarakter, onEditStep, pilihMusikRotasi,
}: AIGenerateTabProps) {
  const jumlahPart = partSpecs.length;
  const [musik, setMusik] = useState('corporate');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<AIGeneratedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zipBusy, setZipBusy] = useState(false);
  const [copiedScene, setCopiedScene] = useState<number | null>(null);

  // ── Provider AI + model + status + progress ──
  const [provider, setProvider] = useState<AiProviderId>('gemini');
  const [model, setModel] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [aiStatus, setAiStatus] = useState<Record<string, AiStatusInfo> | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  // Pembatal generate. readNdjsonFinal() sudah menerima AbortSignal sejak awal,
  // hanya belum pernah diberi — sehingga generate 12 scene tidak bisa dihentikan
  // dan guard beforeunload di bawah justru mengurung user (audit 2026-07-26).
  const abortRef = useRef<AbortController | null>(null);
  // Pembatal regenerate-per-scene TERPISAH dari abortRef generate-penuh (audit
  // 2026-07-28) — sebelumnya berbagi satu ref, jadi kalau regenerate dimulai
  // sementara generate-penuh masih jalan, tombol Cancel generate-penuh diam-diam
  // membatalkan regenerate yang salah alih-alih request yang dimaksud.
  const regenAbortRef = useRef<AbortController | null>(null);
  // Batalkan request yang masih menggantung saat komponen unmount (pindah tab/step)
  // — dulu fetch/NDJSON-read terus jalan di background tanpa guard sama sekali.
  useEffect(() => () => { abortRef.current?.abort(); regenAbortRef.current?.abort(); }, []);

  // Status kuota semua provider (sekali saat mount)
  useEffect(() => { getAiStatus().then(r => { if (r.success && r.data) setAiStatus(r.data); }); }, []);

  // Daftar model saat provider berganti
  useEffect(() => {
    let alive = true;
    setLoadingModels(true);
    setModels([]);
    getAiModels(provider).then(r => {
      if (!alive) return;
      const list = r.success && r.data ? r.data.models : [];
      setModels(list);
      setModel(list[0] ?? '');
    }).finally(() => { if (alive) setLoadingModels(false); });
    return () => { alive = false; };
  }, [provider]);

  // R4: cegah tutup/refresh saat generate AI berlangsung.
  useEffect(() => {
    if (!isGenerating) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [isGenerating]);

  const missingParts = partSpecs.filter(p => p.cuts.length === 0).map(p => p.part);
  const allPartsHavePhoto = jumlahPart > 0 && missingParts.length === 0;
  const canGenerate = selectedKarakter != null && allPartsHavePhoto;
  const platformOpt = PLATFORM_OPTIONS.find(p => p.value === platform);

  // Payload lengkap ai-generate dari state Step 1–3 — dipakai generate penuh
  // maupun regenerate per scene (parameter identik agar hasilnya konsisten).
  const buildGeneratePayload = () => {
    if (!selectedKarakter) return null;
    // Mode 'auto' → rotasi least-recently-used. Diresolve DI SINI (frontend), bukan
    // di backend, karena MUSIK_OPTIONS hidup di frontend dan riwayat sudah termuat;
    // menyalin konstantanya ke backend akan menciptakan batas kontrak baru — persis
    // kelas bug yang sudah beberapa kali menggigit (parts/scenes, hookType nested).
    const musikTerpilih = musik === 'auto' ? pilihMusikRotasi() : musik;
    const musikOpt = MUSIK_OPTIONS.find(m => m.value === musikTerpilih)
      // Jaga-jaga bila value tersimpan tidak dikenal (mis. opsi lama dihapus):
      // jangan biarkan `!` meledak — jatuh ke 'none' yang selalu ada.
      ?? MUSIK_OPTIONS.find(m => m.value === 'none')!;
    const part_assignments = partSpecs.map(p => ({
      part: p.part,
      role: p.role,
      durasi: p.durasi,
      vo_durasi: p.vo_durasi,
      label: p.label,
      cuts: p.cuts,
    }));
    const part_roles = partSpecs.map(p => ({ part: p.part, role: p.role }));
    const part_durations = partSpecs.map(p => ({ part: p.part, durasi: p.durasi }));
    // Kirim label yang sudah diresolve (bukan raw value) — backend tinggal
    // menyisipkan teksnya, tidak perlu daftar terjemahan tone/style/hook/cta sendiri.
    const toneLabel = TONES.find(t => t.value === tone)?.label ?? tone;
    const visualStyleLabel = VISUAL_STYLES.find(v => v.value === visualStyle)?.label ?? visualStyle;
    const hookTypeLabel = HOOK_TYPES.find(h => h.value === hookType)?.label ?? hookType;
    const ctaTypeLabel = CTA_TYPES.find(c => c.value === ctaType)?.label ?? ctaType;
    const supportsRefImage = AI_TOOL_FORMAT_SPEC[aiTool]?.supportsRefImage ?? false;

    // Arketipe (opsional) — client hitung koreografi kamera PER PART + arahan
    // sutradara, kirim sebagai string siap-pakai supaya backend tidak perlu
    // menduplikasi data arketipe.
    const arc = findArchetype(archetype);
    const durasiPart = (n: number) => partSpecs[n - 1]?.durasi ?? PLATFORM_DURASI_VF[platform] ?? 8;
    const archetype_note = arc
      ? `${arc.label} — ${arc.shotGrammarNote} (mode presenter: ${arc.presenterMode}, pacing: ${arc.pacing})`
      : '';
    // PART yang dikecualikan dari cutaway (arketipe hybrid) → kirim camera hint
    // "steady, no cutaway", BUKAN koreografi cutaway biasa — supaya instruksi
    // per-Part tidak bertentangan dengan aturan "SATU shot talking-head saja".
    const cutawayExcludedInRange = arc?.allowMultiShotPerScene
      ? cutawayExcluded.filter(n => n >= 1 && n <= jumlahPart)
      : [];
    const camera_directives = arc
      ? partSpecs.map((p, i) => ({
          part: p.part,
          camera: cutawayExcludedInRange.includes(p.part)
            // Part talking-head: pola 2-bagian tidak berlaku, TAPI gaya kameranya
            // tetap harus sesuai arketipe — pakai leadInCamera-nya kalau ada,
            // supaya arketipe selfie tidak berubah jadi handheld biasa di Part CTA.
            ? (arc.leadInCamera
                ? `${arc.leadInCamera}; presenter stays in frame for the whole Part, no b-roll cutaway`
                : 'steady handheld shot, presenter stays in frame throughout, no cutaway')
            // Durasi cut PERTAMA = batas bagian selfie/presenter. Tanpa ini titik
            // potong jatuh ke tengah durasi dan bertentangan dengan storyboard.
            : compileCameraChoreography(arc.cameraGrammar, p.role, durasiPart(p.part), i, aiTool, supportsRefImage, arc.leadInCamera, p.cuts?.[0]?.durasi),
        }))
      : [];

    return {
      property_id: propertyId,
      jumlah_part: jumlahPart,
      platform,
      ai_tool: aiTool,
      bahasa,
      tone: toneLabel,
      visual_style: visualStyleLabel,
      hook_type: hookTypeLabel,
      cta_type: ctaTypeLabel,
      // Contoh KALIMAT terucap, bukan cuma nama kategori. Tanpa ini AI mengarang
      // ajakan kabur yang tak menyebut objeknya (audit 2026-08-04).
      cta_example: CTA_SPOKEN_EXAMPLE[ctaType] ?? '',
      part_roles,
      part_durations,
      // Kirim value yang SUDAH diresolve, bukan 'auto' — supaya riwayat mencatat
      // musik yang benar-benar dipakai dan rotasi berikutnya punya data yang sahih.
      musik_value: musikOpt.value,
      musik_prompt: musikOpt.prompt,
      karakter_id: selectedKarakter.id,
      expression: selectedKarakter.expression,
      part_assignments,
      supports_ref_image: supportsRefImage,
      archetype_note,
      // ID arketipe (bukan cuma note-nya) — dipakai backend untuk mencatat riwayat
      // supaya badge "dipakai Nx" di picker arketipe ikut menghitung generate Jalur C,
      // bukan hanya yang lewat alur Master Prompt.
      archetype,
      camera_directives,
      presenter_mode: arc?.presenterMode ?? 'on_camera',
      multi_shot_scene: arc?.allowMultiShotPerScene === true,
      cutaway_excluded_scenes: cutawayExcludedInRange,
      register_instruction: REGISTER_INSTRUCTION[register] ?? '',
      // Tiga parameter dari Parameter Video yang selama ini TIDAK PERNAH sampai ke prompt
      // (audit 2026-07-28). Pola sama seperti archetype_note: client meresolve
      // teksnya, backend tinggal menyisipkan — backend tidak perlu tabel sendiri.
      ratio,
      platform_behavior: PLATFORM_BEHAVIOR[platform] ?? '',
      tool_format_spec: AI_TOOL_FORMAT_SPEC[aiTool]?.formatSpec ?? '',
      provider,
      model,
    };
  };

  const handleGenerate = async () => {
    if (!canGenerate || !selectedKarakter) return;
    setIsGenerating(true);
    setError(null);
    // Progress "indeterminate" yang merangkak naik selama request.
    setProgress(6);
    setProgressLabel(`Menghubungi ${AI_PROVIDER_LIST.find(p => p.id === provider)?.label ?? provider}…`);
    const progTimer = setInterval(() => setProgress(p => (p < 90 ? p + Math.max(1, (90 - p) * 0.08) : p)), 600);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const payload = buildGeneratePayload();
      if (!payload) throw new Error('Konfigurasi belum lengkap');
      const res = await fetch('/api/admin/viralframe/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
        signal: ac.signal,
      });
      // Sukses = stream NDJSON (anti wall-clock 30s); error validasi = JSON biasa.
      const data = pastikanHasilGenerate(await readNdjsonFinal<unknown>(res, { signal: ac.signal }));
      setProgress(100);
      setProgressLabel(data.metadata?.fell_back
        ? `Selesai (fallback ke ${data.metadata.provider_used})`
        : 'Selesai');
      setGeneratedResult(data);
      // Refresh status kuota setelah generate (mungkin berubah)
      getAiStatus().then(r => { if (r.success && r.data) setAiStatus(r.data); });
    } catch (e: unknown) {
      // Pembatalan oleh user bukan kegagalan — jangan tampilkan sebagai error merah.
      if (e instanceof DOMException && e.name === 'AbortError') {
        setProgressLabel('Dibatalkan');
      } else {
        setError(e instanceof Error ? e.message : 'Terjadi kesalahan');
      }
    } finally {
      clearInterval(progTimer);
      setIsGenerating(false);
      abortRef.current = null;
    }
  };

  const handleCancelGenerate = () => {
    abortRef.current?.abort();
    setProgress(0);
  };

  // Regenerate SATU scene: kirim konfigurasi yang sama + regenerate_scene + konteks
  // scene lain (agar dialog baru tetap nyambung), lalu ganti scene itu di hasil.
  const [regenScene, setRegenScene] = useState<number | null>(null);
  const handleRegenerateScene = async (sceneNum: number) => {
    if (!generatedResult || regenScene != null) return;
    setRegenScene(sceneNum);
    setError(null);
    // Pembatal SENDIRI (regenAbortRef, bukan abortRef generate-penuh) — supaya
    // Cancel generate-penuh tidak salah membatalkan request regenerate ini, dan
    // sebaliknya (lihat catatan di deklarasi regenAbortRef).
    const ac = new AbortController();
    regenAbortRef.current = ac;
    try {
      const payload = buildGeneratePayload();
      if (!payload) throw new Error('Konfigurasi belum lengkap');
      const res = await fetch('/api/admin/viralframe/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: ac.signal,
        body: JSON.stringify({
          ...payload,
          regenerate_part: sceneNum,
          existing_parts: generatedResult.parts.map(s => ({
            part: s.part, kamera: s.kamera, dialog_karakter: s.dialog_karakter,
          })),
        }),
      });
      const data = pastikanHasilGenerate(await readNdjsonFinal<unknown>(res, { signal: ac.signal }));
      const newScene = data.parts[0];
      if (!newScene) throw new Error('AI tidak mengembalikan scene baru');
      // Backend sudah memaksa scene = regenerateScene di mode ini (lihat ai-generate.js
      // "Mode regenerate: paksa nomor scene"), tapi tetap divalidasi ulang di sini —
      // kalau backend berubah/gagal, JANGAN menimpa scene yang salah secara diam-diam.
      if (newScene.part !== sceneNum) {
        throw new Error(`AI mengembalikan Part ${newScene.part}, bukan Part ${sceneNum} yang diminta — tidak disimpan.`);
      }
      setGeneratedResult(prev => prev
        ? { ...prev, parts: prev.parts.map(s => (s.part === sceneNum ? newScene : s)) }
        : prev);
      getAiStatus().then(r => { if (r.success && r.data) setAiStatus(r.data); });
    } catch (e: unknown) {
      // Pembatalan oleh user bukan kegagalan.
      if (e instanceof DOMException && e.name === 'AbortError') { /* diam */ }
      else setError(e instanceof Error ? e.message : `Gagal regenerate Part ${sceneNum}`);
    } finally {
      setRegenScene(null);
      regenAbortRef.current = null;
    }
  };

  const handleDownloadZip = async () => {
    if (!generatedResult) return;
    setZipBusy(true);
    setError(null);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const { parts: scenes, foto_urls, karakter, metadata } = generatedResult;
      const platform = PLATFORM_OPTIONS.find(p => p.value === metadata.platform);
      const musik = MUSIK_OPTIONS.find(m => m.value === metadata.musik_value);
      const musikLabel = musik?.label ?? metadata.musik_value;
      const kode = (metadata.kode_listing ?? 'SBP').replace(/[^a-zA-Z0-9]/g, '-');

      // ZIP per-PART: satu folder per Part berisi PROMPT.txt siap-tempel +
      // LAMPIRKAN/ berisi foto referensi. Nama file di LAMPIRKAN/ WAJIB identik
      // dengan yang disebut PROMPT.txt (keduanya dari cuts[].photo yang berasal
      // dari buildZipNames()) — salah nama = user melampirkan ruangan yang keliru.
      const karakterFile = namaFileKarakter(karakter.nama);
      const urlByFile = new Map<string, string>();
      partSpecs.forEach(ps => ps.cuts.forEach(c => urlByFile.set(c.foto_file, c.foto_url)));

      const missingFoto: string[] = [];
      for (const part of scenes) {
        const refFiles = [...new Set((part.cuts ?? []).map(c => c.photo).filter((x): x is string => !!x))];
        const folder = `part${part.part}_${slugifyLabel(part.role || 'part')}`;
        const partData = {
          part: part.part,
          total_part: scenes.length,
          role: part.role ?? null,
          properti: metadata.judul_properti,
          kode_listing: metadata.kode_listing,
          platform: platform?.label ?? metadata.platform,
          rasio: platform?.rasio ?? null,
          durasi_detik: part.durasi_detik ?? platform?.durasi ?? null,
          vo_durasi_detik: part.vo_durasi_detik ?? null,
          ai_tool: metadata.ai_tool,
          bahasa: metadata.bahasa,
          musik: musikLabel,
          lampirkan_reference_image: part.reference_images ?? refFiles,
          karakter_file: karakterFile,
          kamera: part.kamera,
          prompt: part.prompt,
          // Untuk Veo/Flow, dialog sudah TERTANAM di dalam 'prompt' (di dalam tanda
          // kutip) — 'dialog_karakter' tinggal jadi rujukan naskah untuk editor.
          dialog_karakter: part.dialog_karakter,
          ...(part.presentation ? { presentation: part.presentation } : {}),
          ...(part.negative_prompt ? { negative_prompt: part.negative_prompt } : {}),
          ...(part.max_clip_sec ? { max_clip_sec: part.max_clip_sec } : {}),
          // cuts[] — potongan visual DI DALAM satu generate call (pengganti sequences[]),
          // gesture/emotion ikut disertakan bila ada (bug "sequences hilang dari ZIP" 2026-07-28).
          ...(Array.isArray(part.cuts) && part.cuts.length > 0 ? { cuts: part.cuts } : {}),
          on_screen_text: getOnScreenTextArray(part.on_screen_text),
          catatan_musik: metadata.musik_value !== 'none'
            ? 'Deskripsi audio optimal untuk Veo3/Google Flow. Kling/Wan: efek suara saja, tambahkan musik via CapCut.'
            : 'Mode tanpa musik.',
          generated_at: metadata.generated_at,
          generator: 'ViralFrame AI · salambumi.xyz',
        };

        const daftarLampiran = [...refFiles, ...(karakter.foto_url ? [karakterFile] : [])];
        zip.file(`${folder}/PROMPT.txt`, [
          `LAMPIRKAN SEBAGAI REFERENCE IMAGE (isi folder LAMPIRKAN/):`,
          ...daftarLampiran.map((f, i2) => `  ${i2 + 1}. ${f}`),
          '─'.repeat(60),
          part.prompt,
          '',
          '─'.repeat(60),
          'METADATA (JSON):',
          JSON.stringify(partData, null, 2),
        ].join('\n'));

        for (const file of refFiles) {
          const url = urlByFile.get(file);
          if (!url) { missingFoto.push(`${file} (Part ${part.part})`); continue; }
          const res = await fetch(`/api/admin/media?key=${encodeURIComponent(url)}`, { credentials: 'include' });
          if (!res.ok) { missingFoto.push(`${file} (Part ${part.part})`); continue; }
          zip.file(`${folder}/LAMPIRKAN/${file}`, await res.blob());
        }
        if (karakter.foto_url) {
          try {
            const res = await fetch(`/api/admin/media?key=${encodeURIComponent(karakter.foto_url)}`, { credentials: 'include' });
            if (res.ok) zip.file(`${folder}/LAMPIRKAN/${karakterFile}`, await res.blob());
          } catch { /* foto karakter opsional */ }
        }
      }
      // Gagal fetch TIDAK ditelan diam-diam — ZIP "sukses" tanpa foto sementara
      // PROMPT.txt tetap menyebut namanya adalah jebakan (audit 2026-07-28).
      if (missingFoto.length > 0) {
        throw new Error(`Gagal mengambil foto: ${missingFoto.join(', ')} — ZIP dibatalkan agar tidak mengunduh paket yang tidak lengkap.`);
      }

      const readme = [
        '═══════════════════════════════════════════',
        'SALAM BUMI PROPERTY — VIRALFRAME ZIP GUIDE',
        '═══════════════════════════════════════════',
        `Properti    : ${metadata.judul_properti}`,
        `Kode Listing: ${metadata.kode_listing}`,
        `Dibuat      : ${metadata.generated_at}`,
        `Platform    : ${platform?.label ?? metadata.platform} (${platform?.rasio ?? '-'})`,
        `AI Tool     : ${metadata.ai_tool}`,
        `Jumlah Scene: ${scenes.length}`,
        `Karakter    : ${karakter.nama}`,
        '',
        '───────────────────────────────────────────',
        'CARA PAKAI:',
        `1. Buka ${metadata.ai_tool} (${metadata.ai_tool === 'google_flow' ? 'labs.google/fx/tools/flow' : 'misal: labs.google.com/video untuk Veo3'})`,
        '2. Upload foto: scene1_foto.webp',
        `3. Upload karakter: ${namaFileKarakter(karakter.nama)} (sebagai reference/style)`,
        ...(isNativeAudioTool(metadata.ai_tool)
          ? [
              '4. Copy-paste isi field "prompt" dari scene1.txt.',
              '   PENTING: dialog sudah TERTANAM di dalam "prompt" (di dalam tanda kutip)',
              '   — jangan dihapus, itulah yang membuat agen benar-benar BERSUARA.',
              '   Field "dialog_karakter" cuma salinan naskah untuk editor.',
              '4b. Tempel isi field "negative_prompt" ke kolom Negative Prompt di tool',
              '    (menekan subtitle yang terbakar ke dalam gambar).',
            ]
          : ['4. Copy-paste isi field "prompt" dari scene1.txt (file JSON — dialog karakter ada di field "dialog_karakter")']),
        '5. Generate video → download',
        '6. Ulangi untuk scene 2, 3, dst',
        '7. Gabungkan semua scene di CapCut / DaVinci Resolve',
        '',
        '───────────────────────────────────────────',
        'ISI FILE ZIP:',
        ...scenes.map(s => `  part${s.part}_${slugifyLabel(s.role || 'part')}/PROMPT.txt  — Prompt siap-tempel Part ${s.part}`),
        ...scenes.map(s => `  part${s.part}_${slugifyLabel(s.role || 'part')}/LAMPIRKAN/  — Foto referensi Part ${s.part} (lampirkan SEMUA)`),
        '  README_cara_pakai.txt — File ini',
        '',
        '───────────────────────────────────────────',
        'TENTANG MUSIK:',
        '  Google Flow : Native audio & dialog lip-sync → menghasilkan musik ✅',
        '  Veo3  : Deskripsi musik dalam prompt → menghasilkan musik ✅',
        '  Kling : Efek suara saja, musik tidak terjamin ⚠️',
        '  Wan   : Efek suara saja, musik tidak terjamin ⚠️',
        '  Tip   : Untuk musik pasti, tambahkan di CapCut/DaVinci Resolve',
        '',
        '═══════════════════════════════════════════',
        'Dibuat oleh ViralFrame AI · salambumi.xyz',
        'Salam Bumi Property · Yogyakarta',
        '═══════════════════════════════════════════',
      ].join('\n');
      zip.file('README_cara_pakai.txt', readme);

      const out = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${kode}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal membuat ZIP');
    } finally {
      setZipBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {!generatedResult && (
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-[#0F172A]">📋 Ringkasan Konfigurasi</label>
              <span className="text-xs text-[#94A3B8]">dari Step 1–3 · {kodeListingStr}</span>
            </div>
            <div className="border border-gray-100 rounded-xl divide-y divide-gray-100">
              <div className="px-4 py-2.5">
                <span className="text-xs text-[#64748B] block mb-1.5">Platform</span>
                <div className="flex flex-wrap gap-1.5">
                  {platforms.map(p => {
                    const opt = PLATFORM_OPTIONS.find(o => o.value === p);
                    const isPrimer = p === platform;
                    return (
                      <span key={p} className={`text-xs px-2 py-1 rounded-lg flex items-center gap-1 ${
                        isPrimer ? 'bg-[#1565C0] text-white font-semibold' : 'bg-[#F0F7FF] text-[#1565C0]'
                      }`}>
                        {opt?.label ?? p}
                        {isPrimer && <span className="text-[9px] font-bold">PRIMER</span>}
                      </span>
                    );
                  })}
                </div>
                <p className="text-[11px] text-[#94A3B8] mt-1">
                  Prompt dioptimasi untuk {platformOpt?.label ?? platform} — platform lain di atas belum diproses terpisah.
                </p>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs text-[#64748B]">AI Tool</span>
                <span className="text-sm font-medium text-[#0F172A]">{AI_TOOLS.find(t => t.value === aiTool)?.label ?? aiTool}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs text-[#64748B]">Jumlah Part</span>
                <span className="text-sm font-medium text-[#0F172A]">{jumlahPart} Part · {partSpecs.reduce((a, p) => a + p.cuts.length, 0)} cut</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs text-[#64748B]">Bahasa Dialog Karakter</span>
                <span className="text-sm font-medium text-[#0F172A]">{bahasa}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs text-[#64748B]">Tone Narasi</span>
                <span className="text-sm font-medium text-[#0F172A]">{TONES.find(t => t.value === tone)?.label ?? tone}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs text-[#64748B]">Gaya Visual</span>
                <span className="text-sm font-medium text-[#0F172A]">{VISUAL_STYLES.find(v => v.value === visualStyle)?.label ?? visualStyle}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs text-[#64748B]">Tipe Hook (Scene 1)</span>
                <span className="text-sm font-medium text-[#0F172A]">{HOOK_TYPES.find(h => h.value === hookType)?.label ?? hookType}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs text-[#64748B]">CTA (Scene Terakhir)</span>
                <span className="text-sm font-medium text-[#0F172A]">{CTA_TYPES.find(c => c.value === ctaType)?.label ?? ctaType}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs text-[#64748B]">Karakter</span>
                {selectedKarakter ? (
                  <span className="flex items-center gap-2 text-sm font-medium text-[#0F172A]">
                    <img src={thumbSrc(selectedKarakter.foto_url, 64)} alt="" className="w-6 h-6 rounded-full object-cover" loading="lazy" decoding="async" />
                    {selectedKarakter.nama}
                  </span>
                ) : (
                  <span className="text-sm font-medium text-amber-600">⚠️ Belum pilih</span>
                )}
              </div>
              {/* Arketipe faceless/voiceover tetap menuntut karakter — ia dipakai
                  sebagai persona SUARA narator, bukan sosok di layar. Tanpa
                  keterangan ini kewajiban tersebut terbaca seperti bug. */}
              {(() => {
                const arc = findArchetype(archetype);
                if (!arc || arc.presenterMode === 'on_camera') return null;
                return (
                  <div className="px-4 pb-2.5 -mt-1">
                    <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                      Arketipe <strong>{arc.label}</strong> tidak menampilkan orang di layar, tapi karakter tetap wajib dipilih —
                      dipakai sebagai <strong>persona suara narator</strong> (nada bicara &amp; ekspresi), bukan sosok yang tampil.
                    </p>
                  </div>
                );
              })()}
              <div className="px-4 py-2.5">
                <span className="text-xs text-[#64748B] block mb-1.5">Foto referensi per Part</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {partSpecs.map(p => {
                    const files = [...new Set(p.cuts.map(c => c.foto_file))];
                    const kosong = files.length === 0;
                    return (
                      <span key={p.part} className={`text-xs px-2 py-1 rounded-lg ${kosong ? 'bg-amber-50 text-amber-600' : 'bg-[#F0F7FF] text-[#1565C0]'}`}>
                        Part {p.part} ({p.role}): {kosong ? '⚠️ kosong' : files.join(', ')}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              {/* Index section accordion: 0 Label/Part · 1 Karakter · 3 Parameter */}
              <button type="button" onClick={() => onEditStep(0)} className="text-xs font-medium text-[#1565C0] hover:underline">Edit Label Foto &amp; Part</button>
              <button type="button" onClick={() => onEditStep(1)} className="text-xs font-medium text-[#1565C0] hover:underline">Edit Karakter</button>
              <button type="button" onClick={() => onEditStep(3)} className="text-xs font-medium text-[#1565C0] hover:underline">Edit Parameter</button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1.5">⚙️ Gaya Musik</label>
            <select value={musik} onChange={e => setMusik(e.target.value)} className={selectCls}>
              {MUSIK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* ── Sumber AI: provider + model + status kuota ── */}
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1.5">🤖 Sumber AI</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
              {AI_PROVIDER_LIST.map(p => {
                const st = aiStatus?.[p.id];
                const active = provider === p.id;
                return (
                  <button key={p.id} type="button" onClick={() => setProvider(p.id)}
                    title={st?.detail ?? 'memuat status…'}
                    className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      active ? 'bg-[#EFF6FF] border-[#1565C0] text-[#1565C0]' : 'bg-white border-gray-200 text-[#64748B] hover:bg-gray-50'
                    }`}>
                    <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: st ? AI_STATUS_COLOR[st.color] : '#CBD5E1' }} />
                    {p.label}
                  </button>
                );
              })}
            </div>
            <select value={model} onChange={e => setModel(e.target.value)} disabled={loadingModels || models.length === 0} className={selectCls}>
              {loadingModels && <option>Memuat model…</option>}
              {!loadingModels && models.length === 0 && <option value="">— Key belum diatur di Pengaturan —</option>}
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <p className="text-[10px] text-[#94A3B8] mt-1">
              Kuota habis di tengah proses? Sistem otomatis beralih ke provider lain. Atur API key di menu <strong>Pengaturan → AI Providers</strong>.
            </p>
          </div>

          {!canGenerate && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
              ⚠️ Lengkapi {!selectedKarakter && 'karakter (Step 2)'}{!selectedKarakter && !allPartsHavePhoto && ' dan '}{!allPartsHavePhoto && (jumlahPart === 0 ? 'rancangan Part (Parameter Video)' : `foto Part ${missingParts.join(', ')}`)} terlebih dahulu.
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {isGenerating && (
            <div className="space-y-1.5">
              <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.round(progress)}%`, background: 'linear-gradient(90deg, #1565C0, #29B6F6)' }} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-[#64748B] flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> {progressLabel || 'Memproses…'} ({Math.round(progress)}%)
                </p>
                <button type="button" onClick={handleCancelGenerate}
                  className="shrink-0 px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-[#64748B] hover:bg-gray-50 transition-colors">
                  Batalkan
                </button>
              </div>
            </div>
          )}

          <button onClick={handleGenerate} disabled={!canGenerate || isGenerating}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
            {isGenerating
              ? <><Loader2 size={16} className="animate-spin" /> Memproses…</>
              : <>🚀 Generate dengan {AI_PROVIDER_LIST.find(p => p.id === provider)?.label ?? provider}</>}
          </button>
        </div>
      )}

      {generatedResult && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-emerald-600">✅ {generatedResult.parts.length} prompt Part berhasil dibuat untuk {propertyTitle}!</p>
            <button onClick={() => { setGeneratedResult(null); setError(null); }} className="text-xs text-[#1565C0] underline">Buat ulang</button>
          </div>
          {generatedResult.metadata.provider_used && (
            <p className="text-xs text-[#64748B]">
              Digenerate oleh <strong>{generatedResult.metadata.provider_used}</strong>
              {generatedResult.metadata.model_used ? ` (${generatedResult.metadata.model_used})` : ''}
              {generatedResult.metadata.fell_back && (
                <span className="ml-1 text-amber-600">· fallback otomatis dari {generatedResult.metadata.provider_requested} karena kuota/error</span>
              )}
            </p>
          )}

          <div className="space-y-3">
            {generatedResult.parts.map(s => (
              <div key={s.part} className={`p-3 border rounded-xl bg-[#F8FAFC] transition-colors ${regenScene === s.part ? 'border-[#1565C0]/40' : 'border-gray-100'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-6 h-6 rounded-full bg-[#1565C0] text-white text-xs font-bold flex items-center justify-center">{s.part}</span>
                  <span className="text-xs font-semibold text-[#64748B] flex-1">{s.kamera}</span>
                  <button
                    onClick={() => handleRegenerateScene(s.part)}
                    disabled={regenScene != null}
                    title={`Generate ulang scene ${s.part} dengan variasi baru (scene lain tidak berubah)`}
                    className="flex-shrink-0 text-[11px] font-semibold text-amber-600 flex items-center gap-1 disabled:opacity-40">
                    {regenScene === s.part
                      ? <><Loader2 size={12} className="animate-spin" /> Membuat ulang…</>
                      : <><RefreshCw size={12} /> Regenerate</>}
                  </button>
                  <button
                    onClick={() => { navigator.clipboard?.writeText(JSON.stringify(s, null, 2)).then(() => { setCopiedScene(s.part); setTimeout(() => setCopiedScene(c => (c === s.part ? null : c)), 1500); }).catch(() => {}); }}
                    className="flex-shrink-0 text-[11px] font-semibold text-[#1565C0] flex items-center gap-1">
                    {copiedScene === s.part ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy JSON</>}
                  </button>
                </div>
                <p className="text-xs text-[#0F172A] leading-relaxed">{s.prompt.slice(0, 200)}{s.prompt.length > 200 ? '…' : ''}</p>
                <p className="text-xs text-[#1565C0] mt-1.5 italic">"{s.dialog_karakter}"</p>
                {s.presentation && (
                  <p className="text-xs text-[#64748B] mt-1">
                    <span className="font-semibold">Presentasi:</span> {s.presentation}
                  </p>
                )}
                {getOnScreenTextArray(s.on_screen_text).length > 0 && (
                  <p className="text-xs text-[#7C3AED] mt-1 flex items-center gap-1">
                    <span className="font-semibold">Teks on-screen:</span> {getOnScreenTextArray(s.on_screen_text).join(' / ')}
                  </p>
                )}
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button onClick={handleDownloadZip} disabled={zipBusy}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
            {zipBusy ? <><Loader2 size={16} className="animate-spin" /> Membuat ZIP...</> : <>⬇️ Download ZIP</>}
          </button>
          {/* Struktur ZIP sebenarnya = folder per Part (part1_hook/PROMPT.txt +
              LAMPIRKAN/), lihat handleDownloadZip(). Teks lama "scene1.txt" sudah
              tidak menggambarkan isi ZIP sejak refactor Part-as-Generate-Unit. */}
          <p className="text-xs text-[#94A3B8] text-center">ZIP berisi {generatedResult.parts.length} folder Part (PROMPT.txt + LAMPIRKAN/) + karakter + README</p>
        </div>
      )}
    </div>
  );
}

// ─── Halaman utama ──────────────────────────────────────────────────────────
// ── Caption Studio (Tahap 2): N variasi, tiap variasi = 1 caption + 1 baris hashtag (5 kombinasi) ──
function CaptionStudio({ propertyId, platform, registerInstruction }: {
  propertyId: number; platform: string; registerInstruction: string;
}) {
  const [variasi, setVariasi] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ caption: string; hashtags: string }[]>([]);
  const [copied, setCopied] = useState('');
  // Dulu tidak ada AbortController sama sekali (audit 2026-07-28) — klik Generate
  // berkali-kali dengan cepat memicu race condition (hasil variasi lama bisa
  // "menang" dan menimpa hasil yang lebih baru kalau responsnya datang belakangan).
  // Membatalkan request sebelumnya saat request baru mulai menghilangkan race ini
  // sekaligus (request lama tidak akan pernah sempat setResult).
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(c => (c === key ? '' : c)), 1500); } catch { /* noop */ }
  };
  const generate = async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/admin/viralframe/captions', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId, variasi, platform, register_instruction: registerInstruction }),
        signal: ac.signal,
      });
      // Sukses = stream NDJSON (anti wall-clock 30s); error validasi = JSON biasa.
      const data = await readNdjsonFinal<{ captions: { caption: string; hashtags: string }[] }>(r, { signal: ac.signal });
      setResult(data.captions ?? []);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') { /* dibatalkan oleh generate berikutnya / unmount, bukan error */ }
      else setError(e instanceof Error ? e.message : 'Gagal');
    } finally { setLoading(false); }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-display font-bold text-[#0F172A] text-sm flex items-center gap-2">✍️ Caption Studio</h3>
        <div className="flex items-center gap-2">
          <select value={variasi} onChange={e => setVariasi(parseInt(e.target.value, 10))}
            className="text-sm px-2 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-[#1565C0]">
            <option value={1}>1 variasi</option>
            <option value={3}>3 variasi</option>
            <option value={5}>5 variasi</option>
          </select>
          <button onClick={generate} disabled={loading}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-[#1565C0] hover:bg-[#1565C0]/90 disabled:opacity-50 flex items-center gap-1.5">
            {loading ? <><Loader2 size={13} className="animate-spin" /> Membuat…</> : <>✨ Generate Caption</>}
          </button>
        </div>
      </div>
      <p className="text-[11px] text-[#94A3B8]">Tiap variasi = 1 caption + 1 baris hashtag (kombinasi 5, lokasi + jenis + brand). Bisa di-generate ulang.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result.map((c, i) => {
        const combined = c.hashtags ? `${c.caption}\n\n${c.hashtags}` : c.caption;
        return (
          <div key={i} className="border border-gray-100 rounded-xl p-3 space-y-2 bg-[#F8FAFC]">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-[#0F172A] leading-relaxed whitespace-pre-wrap">{c.caption}</p>
              <button onClick={() => copy(combined, `cap-${i}`)} className="flex-shrink-0 text-[11px] font-semibold text-[#1565C0] flex items-center gap-1">
                {copied === `cap-${i}` ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy Semua</>}
              </button>
            </div>
            {c.hashtags && <p className="text-[11px] text-[#1565C0] font-medium">{c.hashtags}</p>}
          </div>
        );
      })}
    </div>
  );
}
const CaptionStudioMemo = memo(CaptionStudio);

// ── Upload Hasil (Tahap 4): upload video jadi dari AI eksternal ke Cloudinary, tertaut karakter/agent ──
interface CharacterOption {
  id: number; nama: string; foto_url: string;
  /** Jenis properti yang jadi spesialisasi agent (migrasi 0037). Kosong = bebas. */
  spesialis?: string[];
  storage_siap?: boolean;
}
interface CloudinaryUploadResult {
  public_id: string; secure_url: string; resource_type?: string; duration?: number; bytes?: number; format?: string;
  width?: number; height?: number;
  error?: { message: string };
}

// Agent tanpa spesialis (mis. Monica Vera "All Properties") sengaja TIDAK
// dianggap cocok di sini — kalau tidak, ia akan selalu ikut terdaftar sebagai
// "yang disarankan" dan saran itu jadi tidak berarti apa-apa.
function cocokSpesialis(c: CharacterOption, jenis: string): boolean {
  return !!jenis && (c.spesialis?.includes(jenis) ?? false);
}
function UploadAgentVideo({ propertyId, kodeListing, defaultCharacterId, platform, registerInstruction, gaya, jenisProperti }: {
  propertyId: number; kodeListing: string; defaultCharacterId: number | null; platform: string; registerInstruction: string;
  /** Jenis properti listing ini — dicocokkan dengan spesialis agent (saran, bukan larangan). */
  jenisProperti: string;
  // Arketipe yang sedang dipilih di Parameter Video. Ikut tersimpan bersama video
  // supaya Analitik bisa membandingkan performa antar gaya tanpa admin mengetik apa pun.
  gaya: string;
}) {
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  // Mode akun global (migrasi 0040). 'terpusat' = semua upload mendarat di akun
  // agent utama, jadi aturan spesialis TIDAK berlaku dan tidak boleh diperingatkan
  // seolah berlaku — backend pun mengizinkannya.
  const [modeAkun, setModeAkun] = useState<'terpusat' | 'per_agent'>('terpusat');
  const [characterId, setCharacterId] = useState<number | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [capVariasi, setCapVariasi] = useState<{ caption: string; hashtags: string }[]>([]);
  const [capLoading, setCapLoading] = useState(false);
  const [capError, setCapError] = useState('');
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Backsound (opsional) — diterapkan ke `file` SEBELUM upload ke Cloudinary,
  // jadi video yang mendarat di Konten Agent sudah "matang" dengan musik latar.
  // Volume "ingat nilai terakhir" via localStorage — bukan preset bernama, sesuai
  // permintaan user (2026-07-28): cukup supaya tidak perlu geser ulang tiap kali.
  const [backsoundId, setBacksoundId] = useState<number | null>(null);
  const [backsoundItem, setBacksoundItem] = useState<BacksoundItem | null>(null);
  const [volumePct, setVolumePct] = useState(() => {
    const saved = typeof window !== 'undefined' ? parseInt(localStorage.getItem('vf_backsound_volume') ?? '', 10) : NaN;
    return Number.isFinite(saved) && saved >= 0 && saved <= 100 ? saved : 25;
  });
  useEffect(() => { localStorage.setItem('vf_backsound_volume', String(volumePct)); }, [volumePct]);
  const [merging, setMerging] = useState(false);
  const [mergeProgress, setMergeProgress] = useState('');
  const [mergeError, setMergeError] = useState('');
  const [mergedBlob, setMergedBlob] = useState<Blob | null>(null);
  const [mergedUrl, setMergedUrl] = useState<string | null>(null);

  // Preview panel permanen (kanan) — tampil begitu file dipilih, ganti ke hasil
  // merge begitu "Terapkan Backsound" selesai. Sebelumnya panel ini baru muncul
  // SETELAH proses selesai (user bingung "tidak ada tampilan visual" — 2026-07-28).
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setLocalPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; }); return; }
    const url = URL.createObjectURL(file);
    setLocalPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // File/backsound/volume berubah setelah merge → preview lama jadi tidak valid,
  // wajib klik "Terapkan Backsound" lagi supaya tidak pernah upload hasil stale.
  const invalidateMerged = () => {
    setMergedBlob(null);
    setMergedUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
  };

  const applyBacksound = async () => {
    if (!file || !backsoundItem || merging) return;
    setMerging(true); setMergeError(''); setMergeProgress('Menyiapkan…');
    invalidateMerged();
    invalidateCaptioned(); // video sumber caption (mergedBlob) akan berubah — caption lama basi
    try {
      setMergeProgress('Mengambil backsound…');
      const backsoundBlob = await fetch(backsoundMediaUrl(backsoundItem.r2_key)).then(r => r.blob());

      setMergeProgress('Memuat FFmpeg…');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { FFmpeg } = await import('@ffmpeg/ffmpeg') as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { fetchFile } = await import('@ffmpeg/util') as any;
      const ffmpeg = new FFmpeg();
      ffmpeg.on('log', ({ message }: { message: string }) => setMergeProgress(message));
      await ffmpeg.load();

      await ffmpeg.writeFile('video.mp4', await fetchFile(file));
      await ffmpeg.writeFile('backsound.mp3', await fetchFile(backsoundBlob));
      // -stream_loop -1: backsound otomatis mengulang kalau lebih pendek dari video.
      // -c:v copy: video stream TIDAK di-re-encode, cuma audio diproses — ringan & cepat.
      // amix melapiskan backsound (volume diturunkan) DI BAWAH audio asli (dialog).
      // normalize=0 WAJIB: default amix (normalize=1) otomatis menyeimbangkan ulang
      // volume kedua track supaya tidak clipping — itu MENIMPA scaling `volume=` di
      // atas, sehingga slider volume terasa "tidak berfungsi". alimiter di akhir
      // tetap menahan clipping tanpa menghapus rasio volume yang sudah diatur user.
      await ffmpeg.exec([
        '-i', 'video.mp4', '-stream_loop', '-1', '-i', 'backsound.mp3',
        '-filter_complex', `[1:a]volume=${(volumePct / 100).toFixed(2)}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[mixed];[mixed]alimiter=limit=0.95[a]`,
        '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-shortest', 'output.mp4',
      ]);
      const data = await ffmpeg.readFile('output.mp4');
      const blob = new Blob([data.buffer], { type: 'video/mp4' });
      setMergedBlob(blob);
      setMergedUrl(URL.createObjectURL(blob));
      setMergeProgress('✅ Selesai!');
    } catch (err: unknown) {
      setMergeError(err instanceof Error ? err.message : 'Gagal menerapkan backsound');
    } finally {
      setMerging(false);
    }
  };

  // ── Auto Caption (opsional, MVP) — transkripsi SELALU dari `file` mentah
  // (bukan mergedBlob) supaya Whisper tidak terganggu musik latar backsound.
  // Burn-in (drawtext per kata) jalan di atas `mergedBlob ?? file` dan PALING
  // TERAKHIR dalam pipeline, supaya tidak re-encode video dua kali kalau user
  // pakai backsound + caption sekaligus. Belum ada drag posisi caption — itu
  // ditunda ke iterasi berikutnya (disepakati eksplisit dengan user
  // 2026-07-29); posisi/ukuran MVP ini fixed, tapi font & teks kata sudah
  // bisa dipilih/diedit (ditambahkan 2026-07-29 setelah riset pola CapCut:
  // font cuma file TTF statis, tidak ada hambatan arsitektur; edit teks per
  // kata — bukan free-text — supaya timing hasil Whisper tidak pernah rusak).
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState('');
  const [words, setWords] = useState<{ word: string; start: number; end: number }[] | null>(null);
  const [captionFont, setCaptionFont] = useState<keyof typeof CAPTION_FONTS>('inter');
  const [captioning, setCaptioning] = useState(false);
  const [captionProgress, setCaptionProgress] = useState('');
  const [captionError, setCaptionError] = useState('');
  const [captionedBlob, setCaptionedBlob] = useState<Blob | null>(null);
  const [captionedUrl, setCaptionedUrl] = useState<string | null>(null);

  const invalidateCaptioned = () => {
    setCaptionedBlob(null);
    setCaptionedUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
  };

  const transcribeAudio = async () => {
    if (!file || transcribing) return;
    setTranscribing(true); setTranscribeError(''); setWords(null);
    invalidateCaptioned();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { FFmpeg } = await import('@ffmpeg/ffmpeg') as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { fetchFile } = await import('@ffmpeg/util') as any;
      const ffmpeg = new FFmpeg();
      await ffmpeg.load();
      await ffmpeg.writeFile('video.mp4', await fetchFile(file));
      // Audio saja, mono, 16kHz WAV — payload kecil ke Groq, tidak butuh video
      // sama sekali. WAV (pcm_s16le) dipakai daripada mp3 supaya tidak bergantung
      // pada encoder eksternal (libmp3lame) — cukup codec inti libavcodec.
      await ffmpeg.exec(['-i', 'video.mp4', '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', 'audio.wav']);
      const audioData = await ffmpeg.readFile('audio.wav');
      const audioBlob = new Blob([audioData.buffer], { type: 'audio/wav' });

      const res = await fetch('/api/admin/viralframe/transcribe', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'audio/wav' },
        body: audioBlob,
      });
      const json = await bacaJson<{ words: { word: string; start: number; end: number }[] }>(res);
      if (!json.success) throw new Error(json.error ?? 'Gagal transkripsi');
      setWords(json.data?.words ?? []);
    } catch (err: unknown) {
      setTranscribeError(err instanceof Error ? err.message : 'Gagal transkripsi audio');
    } finally {
      setTranscribing(false);
    }
  };

  const applyCaptions = async () => {
    const sourceBlob = mergedBlob ?? file;
    if (!sourceBlob || !words || words.length === 0 || captioning) return;
    setCaptioning(true); setCaptionError(''); setCaptionProgress('Menyiapkan…');
    invalidateCaptioned();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { FFmpeg } = await import('@ffmpeg/ffmpeg') as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { fetchFile } = await import('@ffmpeg/util') as any;
      const ffmpeg = new FFmpeg();
      ffmpeg.on('log', ({ message }: { message: string }) => setCaptionProgress(message));
      await ffmpeg.load();

      setCaptionProgress('Menyiapkan font…');
      const fontBlob = await fetch(CAPTION_FONTS[captionFont].file).then(r => r.blob());
      await ffmpeg.writeFile('font.ttf', await fetchFile(fontBlob));
      await ffmpeg.writeFile('video.mp4', await fetchFile(sourceBlob));

      // Satu drawtext per kata — muncul/hilang persis di jendela [start,end] hasil
      // transkripsi Whisper. Escape karakter yang bentrok dengan sintaks filter
      // ffmpeg (: ' \) — drawtext lain gampang rusak kalau teks mengandung itu.
      const escapeDrawtext = (s: string) => s.replace(/\\/g, '\\\\\\\\').replace(/:/g, '\\:').replace(/'/g, "\\\\\\'");
      // borderw TIDAK mendukung ekspresi seperti fontsize/x/y (butuh integer
      // literal) — "borderw=h/220" bikin drawtext gagal init & ffmpeg Abort()
      // (reproduced live 2026-07-29). Angka tetap sudah cukup untuk MVP (posisi/
      // ukuran belum bisa diatur user di iterasi ini).
      const vf = words
        .map(w => `drawtext=fontfile=font.ttf:text='${escapeDrawtext(w.word)}':fontcolor=white:fontsize=h/18:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.78:enable='between(t\\,${w.start.toFixed(2)}\\,${w.end.toFixed(2)})'`)
        .join(',');

      // -c:v libx264 + -pix_fmt yuv420p WAJIB eksplisit — tanpa itu ffmpeg
      // memilih codec/pixel-format default yang TIDAK selalu bisa diputar browser
      // (reproduced live 2026-07-29: video.error MEDIA_ERR_SRC_NOT_SUPPORTED).
      // -preset ultrafast: re-encode penuh + puluhan drawtext dirangkai (1 per
      // kata) di ffmpeg.wasm (WASM single-thread, tanpa GPU) sangat lambat di
      // preset default (speed=0.08x diukur live — video 40 detik/77 kata ~8
      // menit). ultrafast bertukar ukuran file lebih besar demi kecepatan render
      // jauh lebih tinggi — sepadan untuk video short-form yang toh dikompres
      // ulang oleh TikTok/Reels/dsb saat diunggah.
      await ffmpeg.exec(['-i', 'video.mp4', '-vf', vf, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'copy', 'output.mp4']);
      const data = await ffmpeg.readFile('output.mp4');
      const blob = new Blob([data.buffer], { type: 'video/mp4' });
      setCaptionedBlob(blob);
      setCaptionedUrl(URL.createObjectURL(blob));
      setCaptionProgress('✅ Selesai!');
    } catch (err: unknown) {
      setCaptionError(err instanceof Error ? err.message : 'Gagal menerapkan caption');
    } finally {
      setCaptioning(false);
    }
  };

  useEffect(() => {
    fetch('/api/admin/viralframe/characters', { credentials: 'include' })
      .then(r => bacaJson(r))
      .then(j => {
        if (!j.success) return;
        setCharacters(j.data?.items ?? []);
        if (j.data?.mode) setModeAkun(j.data.mode);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (defaultCharacterId != null) setCharacterId(defaultCharacterId);
  }, [defaultCharacterId]);

  const generateCaption = async () => {
    setCapLoading(true); setCapError('');
    try {
      const r = await fetch('/api/admin/viralframe/captions', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId, variasi: 3, platform, register_instruction: registerInstruction }),
      });
      const data = await readNdjsonFinal<{ captions: { caption: string; hashtags: string }[] }>(r);
      setCapVariasi(data.captions ?? []);
    } catch (e: unknown) { setCapError(e instanceof Error ? e.message : 'Gagal generate caption'); } finally { setCapLoading(false); }
  };

  const pickVariasi = (c: { caption: string; hashtags: string }) => { setCaption(c.caption); setHashtags(c.hashtags); };

  const agentTerpilih = characters.find(c => c.id === characterId) ?? null;
  const agentDisarankan = characters.filter(c => cocokSpesialis(c, jenisProperti));

  const reset = () => {
    setFile(null); setCaption(''); setHashtags(''); setCapVariasi([]); setProgress(0); setError(''); setSuccess(false);
    setBacksoundId(null); setBacksoundItem(null); setMergeError(''); invalidateMerged();
    setWords(null); setTranscribeError(''); setCaptionError(''); invalidateCaptioned();
    if (fileRef.current) fileRef.current.value = '';
  };

  const upload = async () => {
    if (!file) { setError('Pilih file video dulu'); return; }
    if (!characterId) { setError('Pilih karakter/agent dulu'); return; }
    setUploading(true); setError(''); setSuccess(false); setProgress(0);
    try {
      // character_id WAJIB dikirim: dialah yang menentukan akun Cloudinary mana
      // yang dipakai (migrasi 0037). Tanpa itu semua video kembali mendarat di
      // akun global.
      const signRes = await fetch('/api/admin/viralframe/cloudinary-sign', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId, character_id: characterId }),
      });
      const signJson = await bacaJson(signRes);
      if (!signJson.success) throw new Error(signJson.error ?? 'Gagal menyiapkan upload');
      const { cloudName, apiKey, timestamp, folder, signature } = signJson.data;

      // Backsound & caption (opsional) sudah "dipanggang" SEBELUM upload ini —
      // Cloudinary/Konten Agent menerima file final, tidak pernah tahu prosesnya.
      // Caption dibakar PALING TERAKHIR (di atas mergedBlob), jadi diprioritaskan.
      const finalBlob = captionedBlob ?? mergedBlob;
      const uploadFile = finalBlob ? new File([finalBlob], file.name, { type: 'video/mp4' }) : file;
      const form = new FormData();
      form.append('file', uploadFile);
      form.append('api_key', apiKey);
      form.append('timestamp', String(timestamp));
      form.append('folder', folder);
      form.append('signature', signature);

      const cloudinaryResult = await new Promise<CloudinaryUploadResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`);
        xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100)); };
        xhr.onload = () => {
          try {
            const j = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) resolve(j); else reject(new Error(j.error?.message ?? 'Upload Cloudinary gagal'));
          } catch { reject(new Error('Respons Cloudinary tidak valid')); }
        };
        xhr.onerror = () => reject(new Error('Koneksi ke Cloudinary gagal'));
        xhr.send(form);
      });

      const saveRes = await fetch('/api/admin/viralframe/agent-videos', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character_id: characterId, property_id: propertyId, caption: caption || null, hashtags: hashtags || null,
          cloudinary_public_id: cloudinaryResult.public_id, cloudinary_url: cloudinaryResult.secure_url,
          cloudinary_name: cloudName,
          resource_type: cloudinaryResult.resource_type ?? 'video', duration_sec: cloudinaryResult.duration ?? null,
          bytes: cloudinaryResult.bytes ?? null, format: cloudinaryResult.format ?? null,
          width: cloudinaryResult.width ?? null, height: cloudinaryResult.height ?? null,
          gaya: gaya || null,
        }),
      });
      const saveJson = await bacaJson(saveRes);
      if (!saveJson.success) throw new Error(saveJson.error ?? 'Gagal menyimpan metadata video');
      reset();
      setSuccess(true); // setelah reset() — reset() menyetel success=false
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload gagal');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 max-w-3xl">
      <div>
        <h3 className="font-display font-bold text-[#0F172A] text-sm mb-1">📤 Upload Hasil Video</h3>
        <p className="text-xs text-[#64748B]">
          Sudah generate video di AI eksternal (Veo/Kling/dll) dari prompt di atas dan sudah di-download ke PC?
          Upload di sini untuk properti <strong>{kodeListing}</strong> supaya tersimpan rapi per agent/karakter —
          lihat semuanya di halaman <strong>Konten Agent</strong>.
        </p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-[#0F172A] mb-1">File Video</label>
        <input ref={fileRef} type="file" accept="video/*"
          onChange={e => { setFile(e.target.files?.[0] ?? null); invalidateMerged(); invalidateCaptioned(); setWords(null); setTranscribeError(''); setCaptionError(''); }}
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-[#1565C0]" />
        {file && <p className="text-[11px] text-[#94A3B8] mt-1">{file.name} · {(file.size / 1024 / 1024).toFixed(1)}MB</p>}
      </div>

      {/* Backsound (opsional) — dibingkai sebagai "studio" tersendiri (header +
          latar sedikit beda) supaya terasa seperti ruang kerja, bukan sisipan form
          biasa. 2 kolom: kiri kontrol, kanan preview PERMANEN (tampil begitu file
          dipilih, bukan cuma muncul setelah diproses). */}
      {file && (
        <div className="rounded-2xl border border-[#E2E8F0] overflow-hidden" style={{ background: 'linear-gradient(180deg, #F7FAFF 0%, #FFFFFF 140px)' }}>
          <div className="px-4 pt-3.5 pb-1">
            <h4 className="text-sm font-display font-bold text-[#0F172A] flex items-center gap-1.5">🎬 Studio Backsound</h4>
            <p className="text-[11px] text-[#94A3B8] mt-0.5">Musik latar ditambahkan sebelum upload — Konten Agent langsung menerima video yang sudah jadi.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-4 p-4 pt-3">
            <div className="bg-white border border-gray-100 rounded-xl p-3.5 space-y-3">
              <BacksoundPicker
                selectedId={backsoundId}
                onSelect={(id, item) => { setBacksoundId(id); setBacksoundItem(item); invalidateMerged(); invalidateCaptioned(); }}
                volumePct={volumePct}
                onVolumeChange={v => { setVolumePct(v); invalidateMerged(); invalidateCaptioned(); }}
              />
              {backsoundId != null && (
                <button type="button" onClick={applyBacksound} disabled={merging}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
                  {merging ? <Loader2 size={13} className="animate-spin" /> : <Music size={13} />}
                  {merging ? 'Memproses…' : '🎵 Terapkan & Perbarui Preview'}
                </button>
              )}
              {mergeProgress && merging && <p className="text-[11px] font-mono text-[#64748B] bg-gray-50 rounded-lg px-2.5 py-1.5 break-all">{mergeProgress}</p>}
              {mergeError && <p className="text-xs text-red-600">{mergeError}</p>}
            </div>

            <div className="bg-white border border-gray-100 rounded-xl p-3.5 space-y-2.5 lg:sticky lg:top-3 self-start">
              <span className="text-xs font-bold uppercase tracking-wide text-[#94A3B8]">Preview</span>
              <div className="relative rounded-xl overflow-hidden bg-[#0B1220] mx-auto" style={{ aspectRatio: '9/16', maxWidth: 220 }}>
                {(captionedUrl ?? mergedUrl ?? localPreviewUrl) ? (
                  <video controls src={captionedUrl ?? mergedUrl ?? localPreviewUrl ?? undefined} className="absolute inset-0 w-full h-full object-contain" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-[#475569] gap-1.5">
                    <Film size={22} />
                    <span className="text-[10px]">Preview video</span>
                  </div>
                )}
              </div>
              {captionedUrl ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
                  <Check size={10} /> Caption diterapkan — versi ini yang akan ter-upload
                </span>
              ) : mergedUrl ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
                  <Check size={10} /> Backsound diterapkan — versi ini yang akan ter-upload
                </span>
              ) : (
                <span className="inline-flex items-center text-[10px] font-medium text-[#94A3B8] bg-gray-50 rounded-full px-2 py-0.5">
                  Video asli (belum ada backsound/caption)
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Auto Caption (Beta, MVP) — transkripsi kata-per-kata dari suara asli
          (bukan estimasi), dibakar ke video PALING TERAKHIR (di atas backsound
          kalau ada). Edit teks PER KATA (bukan free-text) — pola sama CapCut,
          supaya timing hasil Whisper tidak pernah rusak saat dikoreksi. Drag
          posisi/ukuran masih ditunda ke iterasi berikutnya. */}
      {file && (
        <div className="rounded-2xl border border-[#E2E8F0] overflow-hidden" style={{ background: 'linear-gradient(180deg, #FFF9F0 0%, #FFFFFF 140px)' }}>
          <div className="px-4 pt-3.5 pb-1">
            <h4 className="text-sm font-display font-bold text-[#0F172A] flex items-center gap-1.5">
              <Captions size={15} className="text-[#B45309]" /> Auto Caption <span className="text-[10px] font-semibold text-[#B45309] bg-[#FEF3C7] rounded-full px-1.5 py-0.5">Beta</span>
            </h4>
            <p className="text-[11px] text-[#94A3B8] mt-0.5">Teks otomatis muncul per kata, tersinkron ke suara asli — klik kata untuk koreksi, timing tidak berubah.</p>
          </div>
          <div className="p-4 pt-3 space-y-3">
            {!words && (
              <button type="button" onClick={transcribeAudio} disabled={transcribing}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #B45309 0%, #F59E0B 100%)' }}>
                {transcribing ? <Loader2 size={13} className="animate-spin" /> : <Captions size={13} />}
                {transcribing ? 'Mentranskripsi…' : 'Transkripsi Otomatis'}
              </button>
            )}
            {transcribeError && <p className="text-xs text-red-600">{transcribeError} — <button type="button" onClick={transcribeAudio} className="underline">Coba lagi</button></p>}

            {words && words.length > 0 && (
              <>
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-[#0F172A]">{words.length} kata terdeteksi — klik untuk edit</span>
                    <button type="button" onClick={transcribeAudio} disabled={transcribing} className="text-[11px] text-[#B45309] font-semibold underline disabled:opacity-50">
                      Transkripsi ulang
                    </button>
                  </div>
                  {/* Satu <input> per kata — cuma teksnya yang bisa diubah, timing
                      [start,end] tiap kata TIDAK ikut berubah, jadi sinkron ke
                      suara asli tetap presisi walau user koreksi salah dengar. */}
                  <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto pr-1 -mr-1">
                    {words.map((w, i) => (
                      <input key={i} type="text" value={w.word}
                        onChange={e => {
                          const next = [...words]; next[i] = { ...next[i], word: e.target.value };
                          setWords(next); invalidateCaptioned();
                        }}
                        style={{ width: `${Math.max(2, w.word.length) + 1.5}ch` }}
                        className="text-xs text-[#0F172A] bg-white border border-gray-200 rounded-md px-1.5 py-1 outline-none focus:border-[#B45309] focus:bg-[#FFFBEB]" />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#0F172A] mb-1">Font Caption</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(Object.keys(CAPTION_FONTS) as (keyof typeof CAPTION_FONTS)[]).map(id => (
                      <button key={id} type="button" onClick={() => { setCaptionFont(id); invalidateCaptioned(); }}
                        className={`text-[11px] font-semibold py-1.5 rounded-lg border transition-colors ${
                          captionFont === id ? 'border-[#B45309] bg-[#FEF3C7] text-[#92400E]' : 'border-gray-200 text-[#64748B] hover:border-gray-300'
                        }`}>
                        {CAPTION_FONTS[id].label}
                      </button>
                    ))}
                  </div>
                </div>

                <button type="button" onClick={applyCaptions} disabled={captioning}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #B45309 0%, #F59E0B 100%)' }}>
                  {captioning ? <Loader2 size={13} className="animate-spin" /> : <Captions size={13} />}
                  {captioning ? 'Memproses…' : '✨ Terapkan Caption & Perbarui Preview'}
                </button>
                {captionProgress && captioning && <p className="text-[11px] font-mono text-[#64748B] bg-gray-50 rounded-lg px-2.5 py-1.5 break-all">{captionProgress}</p>}
                {captionError && <p className="text-xs text-red-600">{captionError}</p>}
              </>
            )}
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-[#0F172A] mb-1">Karakter / Agent</label>
        <select value={characterId} onChange={e => setCharacterId(e.target.value ? parseInt(e.target.value, 10) : '')}
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-[#1565C0]">
          <option value="">— Pilih karakter —</option>
          {characters.map(c => (
            <option key={c.id} value={c.id}>
              {c.nama}{cocokSpesialis(c, jenisProperti) ? ` — spesialis ${jenisProperti}` : ''}
            </option>
          ))}
        </select>
        {characters.length === 0 && <p className="text-[11px] text-[#94A3B8] mt-1">Belum ada karakter. Buat dulu di Step 2 — Pilih Karakter.</p>}
        {/* Mode per-agent: spesialis MEMBLOKIR (backend menolak 422, jadi
            peringatan di sini harus tegas, bukan "tetap boleh dilanjut").
            Mode terpusat: semua mendarat di akun agent utama, aturan tidak aktif. */}
        {modeAkun === 'per_agent' && agentTerpilih && !cocokSpesialis(agentTerpilih, jenisProperti)
          && (agentTerpilih.spesialis?.length ?? 0) > 0 && (
          <p className="text-[11px] text-red-600 mt-1">
            {agentTerpilih.nama} khusus properti {agentTerpilih.spesialis?.join('/')}, sedangkan properti ini {jenisProperti} — upload akan ditolak.
            {agentDisarankan.length > 0 && ` Pilih: ${agentDisarankan.map(c => c.nama).join(', ')}.`}
          </p>
        )}
        {modeAkun === 'terpusat' && (
          <p className="text-[11px] text-[#94A3B8] mt-1">
            Mode Terpusat aktif — video mendarat di storage agent utama apa pun agent yang dipilih. Ubah di Konten Agent → Akun Agent.
          </p>
        )}
        {modeAkun === 'per_agent' && agentTerpilih && !agentTerpilih.storage_siap && (
          <p className="text-[11px] text-[#94A3B8] mt-1">
            {agentTerpilih.nama} belum punya Cloudinary sendiri — video akan masuk ke akun global. Atur di Konten Agent → Akun Agent.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="block text-xs font-semibold text-[#0F172A]">Caption &amp; Hashtag</label>
          <button type="button" onClick={generateCaption} disabled={capLoading}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-[#1565C0] border border-[#1565C0]/30 hover:bg-[#F0F7FF] disabled:opacity-50">
            {capLoading ? <><Loader2 size={12} className="animate-spin" /> Membuat…</> : <><Sparkles size={12} /> Generate dengan AI</>}
          </button>
        </div>
        {capError && <p className="text-xs text-red-600">{capError}</p>}
        {capVariasi.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {capVariasi.map((c, i) => (
              <button key={i} type="button" onClick={() => pickVariasi(c)}
                className="text-left text-[11px] px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-[#1565C0] hover:bg-[#F0F7FF] max-w-[220px] truncate">
                {c.caption}
              </button>
            ))}
          </div>
        )}
        <textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="Caption..."
          className="w-full h-20 text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-[#1565C0] resize-y" />
        <textarea value={hashtags} onChange={e => setHashtags(e.target.value)} placeholder="#hashtag #hashtag ..."
          className="w-full h-14 text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-[#1565C0] resize-y" />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && (
        <p className="text-sm text-emerald-600 flex items-center gap-1 flex-wrap">
          <Check size={14} /> Video tersimpan.
          <Link to="/admin/viralframe/agent-videos" className="font-semibold underline hover:text-emerald-700">Lihat di halaman Konten Agent →</Link>
        </p>
      )}

      {uploading && (
        <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full bg-[#1565C0] transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="flex items-center gap-2">
        <button onClick={upload} disabled={uploading || !file}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
          {uploading ? <><Loader2 size={15} className="animate-spin" /> Mengupload… {progress}%</> : <><Upload size={15} /> Upload Video</>}
        </button>
        {(file || caption || hashtags) && !uploading && (
          <button onClick={reset} className="text-xs text-[#94A3B8] hover:text-[#64748B]">Reset</button>
        )}
      </div>

      <p className="text-[11px] text-[#94A3B8]">Batas ukuran file mengikuti kuota akun Cloudinary yang terpasang (free tier ±100MB/file).</p>
    </div>
  );
}
const UploadAgentVideoMemo = memo(UploadAgentVideo);

// ── YouTube Long — storyboard terpandu (pilih foto+label+style → blok JSON) ──
// `risiko: true` = gerakan yang cenderung membawa kamera KELUAR bingkai foto
// referensi (drone/aerial). Jalur YouTube Long selalu image-to-video, jadi
// gerakan itu memaksa AI mengarang area yang tidak ada di foto — properti jadi
// tidak konsisten dengan gambar yang diunggah (audit 2026-07-28).
// Prompt sudah menahannya di sisi backend; penanda ini agar user tahu sebabnya
// bila hasilnya tetap kurang setia.
const YT_CAMERA = [
  { value: 'drone_gimbal', label: 'Kombinasi drone aerial + gimbal interior yang mulus', risiko: true },
  { value: 'drone',        label: 'Drone / aerial dominan (reveal megah)', risiko: true },
  { value: 'gimbal',       label: 'Gimbal cinematic super-mulus' },
  { value: 'handheld',     label: 'Handheld natural (terasa nyata)' },
  { value: 'static',       label: 'Static elegan (tripod, komposisi rapi)' },
];
interface YtBlock { prompt?: Record<string, unknown>; narration_id?: string }
interface YtScene { scene: number; photo_label?: string; prompt?: Record<string, unknown>; narration_id?: string; url_webp?: string | null }
interface YtAgent { id: number; nama: string; foto_url: string | null }
interface YtResult {
  titles?: string[]; description?: string; chapters_timestamp?: string[]; caption?: string; hashtag_sets?: string[];
  thumbnail?: YtBlock; opening?: YtBlock; scenes?: YtScene[]; ending?: YtBlock; provider_used?: string;
  kode_listing?: string; language?: string; agent?: YtAgent | null;
}
function YouTubeLongView({ propertyId, propertyTitle, photos }: { propertyId: number; propertyTitle: string; photos: PropertyImage[] }) {
  const [selected, setSelected] = useState<{ id: number; url_webp: string; label: string }[]>([]);
  const [visualStyle, setVisualStyle] = useState('cinematic_film');
  const [cameraStyle, setCameraStyle] = useState('drone_gimbal');
  const [language, setLanguage] = useState<'id' | 'en'>('id');
  const [useAgent, setUseAgent] = useState(false);
  const [agents, setAgents] = useState<YtAgent[] | null>(null); // null = belum dimuat
  const [agentId, setAgentId] = useState<number | null>(null);
  const [zipBusy, setZipBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<YtResult | null>(null);
  const [copied, setCopied] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const copy = (text: string, key: string) => { navigator.clipboard?.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(c => (c === key ? '' : c)), 1500); }).catch(() => {}); };

  const togglePhoto = (im: PropertyImage) => setSelected(prev => {
    const i = prev.findIndex(s => s.id === im.id);
    if (i >= 0) return prev.filter(s => s.id !== im.id);
    return [...prev, { id: im.id, url_webp: im.url_webp, label: im.label_ruangan?.trim() || '' }];
  });
  const setLabel = (id: number, label: string) => setSelected(prev => prev.map(s => (s.id === id ? { ...s, label } : s)));
  const orderOf = (id: number) => { const i = selected.findIndex(s => s.id === id); return i >= 0 ? i + 1 : null; };
  const ready = selected.length >= 2 && selected.every(s => s.label) && (!useAgent || agentId != null);

  // Muat daftar agen (viralframe_characters) sekali, saat opsi agen pertama kali dinyalakan.
  useEffect(() => {
    if (!useAgent || agents !== null) return;
    fetch('/api/admin/viralframe/characters', { credentials: 'include' })
      .then(r => bacaJson(r))
      .then(j => setAgents(j.data?.items ?? []))
      .catch(() => setAgents([]));
  }, [useAgent, agents]);

  const generate = async () => {
    if (selected.length < 2 || !selected.every(s => s.label)) { setError('Pilih minimal 2 foto dan beri label tiap foto.'); return; }
    if (useAgent && agentId == null) { setError('Pilih agen yang tampil dalam video, atau matikan opsi agen.'); return; }
    setLoading(true); setError(''); setProgress(8);
    const timer = setInterval(() => setProgress(p => (p < 90 ? p + Math.max(1, (90 - p) * 0.06) : p)), 700);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const r = await fetch('/api/admin/viralframe/youtube-long', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, signal: ac.signal,
        body: JSON.stringify({
          property_id: propertyId,
          photos: selected.map(s => ({ label: s.label, url_webp: s.url_webp })),
          visual_style: VISUAL_STYLES.find(v => v.value === visualStyle)?.label ?? '',
          camera_style: YT_CAMERA.find(c => c.value === cameraStyle)?.label ?? '',
          language,
          use_agent: useAgent,
          agent_id: useAgent ? agentId : undefined,
        }),
      });
      // Sukses = stream NDJSON (heartbeat tiap 2s + baris terakhir {done,data|error})
      // agar lolos wall-clock 30s Worker; error validasi tetap JSON biasa.
      // Dulu reader-nya disalin manual di sini dan sudah menyimpang dari
      // src/lib/ndjson.ts: tidak mengenali halaman HTML error (gejala 1102),
      // tanpa penanganan 502/504, tanpa AbortSignal. Sekarang memakai helper
      // bersama yang dipakai lima pemanggil lain.
      const data = await readNdjsonFinal<YtResult>(r, { signal: ac.signal });
      setResult(data); setProgress(100);
    } catch (e: unknown) {
      // Pembatalan oleh user bukan kegagalan — jangan tampilkan sebagai error merah.
      if (e instanceof DOMException && e.name === 'AbortError') setProgress(0);
      else setError(e instanceof Error ? e.message : 'Gagal');
    } finally { clearInterval(timer); setLoading(false); abortRef.current = null; }
  };

  const cancelGenerate = () => { abortRef.current?.abort(); setProgress(0); };

  // ZIP lengkap: prompt JSON per blok + naskah + foto referensi (nama file = field
  // reference_image di prompt) + foto agen — siap dilampirkan ke AI generator.
  const fetchRefBlob = async (url: string) => {
    const src = /^https?:/i.test(url) ? url : `/api/admin/media?key=${encodeURIComponent(url)}`;
    const res = await fetch(src, { credentials: 'include' });
    if (!res.ok) throw new Error('fetch referensi gagal');
    return res.blob();
  };
  const downloadZip = async () => {
    if (!result) return;
    setZipBusy(true); setError('');
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const kode = (result.kode_listing ?? 'SBP').replace(/[^a-zA-Z0-9-]/g, '-');
      if (result.thumbnail?.prompt) zip.file('prompts/00_thumbnail.json', JSON.stringify(result.thumbnail.prompt, null, 2));
      if (result.opening?.prompt) zip.file('prompts/01_opening.json', JSON.stringify(result.opening.prompt, null, 2));
      (result.scenes ?? []).forEach((s, i) => { if (s.prompt) zip.file(`prompts/scene_${i + 1}.json`, JSON.stringify(s.prompt, null, 2)); });
      if (result.ending?.prompt) zip.file('prompts/99_ending.json', JSON.stringify(result.ending.prompt, null, 2));
      zip.file('narasi.txt', [
        `OPENING: ${result.opening?.narration_id ?? ''}`,
        ...(result.scenes ?? []).map(s => `SCENE ${s.scene} (${s.photo_label ?? ''}): ${s.narration_id ?? ''}`),
        `ENDING: ${result.ending?.narration_id ?? ''}`,
      ].join('\n\n'));
      zip.file('judul_deskripsi.txt', [
        'JUDUL (pilih 1):', ...(result.titles ?? []).map((t, i) => `${i + 1}. ${t}`), '',
        'DESKRIPSI:', result.description ?? '', '',
        'CHAPTERS:', ...(result.chapters_timestamp ?? []), '',
        'CAPTION:', result.caption ?? '', '',
        'HASHTAG:', ...(result.hashtag_sets ?? []),
      ].join('\n'));
      const scenes = result.scenes ?? [];
      for (let i = 0; i < scenes.length; i++) {
        const u = scenes[i].url_webp;
        if (!u) continue;
        try { zip.file(`referensi/scene_${i + 1}.webp`, await fetchRefBlob(u)); } catch { /* skip foto gagal */ }
      }
      if (result.agent?.foto_url) {
        try { zip.file('referensi/agent.webp', await fetchRefBlob(result.agent.foto_url)); } catch { /* skip */ }
      }
      zip.file('README.txt', [
        `YouTube Long Storyboard — ${propertyTitle} (${result.kode_listing ?? ''})`,
        `Bahasa narasi: ${result.language === 'en' ? 'English' : 'Bahasa Indonesia'}`,
        result.agent ? `Agen/host: ${result.agent.nama} — referensi/agent.webp (lampirkan di SEMUA blok agar wajah konsisten)` : 'Mode tanpa agen (murni sinematik properti).',
        '',
        'CARA PAKAI:',
        '1. Buka AI video/image generator (Veo3/Kling/dsb).',
        '2. Tiap blok: lampirkan file dari folder referensi/ sesuai field "reference_image" di prompt-nya.',
        result.agent ? '3. Mode agen: lampirkan JUGA referensi/agent.webp di tiap blok.' : '',
        `${result.agent ? '4' : '3'}. Tempel isi prompts/*.json sebagai prompt — UTUH, jangan dipotong.`,
        '   PENTING: dialog sudah TERTANAM di field "dialogue.line" tiap prompt.',
        '   Itulah yang membuat narator/agen benar-benar BERSUARA di Veo/Flow —',
        '   jangan dihapus. Field "negative_prompt" menekan subtitle yang terbakar',
        '   ke dalam gambar; tempel juga ke kolom Negative Prompt bila tool punya.',
        `${result.agent ? '5' : '4'}. narasi.txt hanya SALINAN naskah untuk editor/subtitle manual —`,
        '   bukan sesuatu yang perlu ditempel lagi ke AI. Judul/deskripsi/hashtag di judul_deskripsi.txt.',
        '',
        'Generator: ViralFrame AI · salambumi.xyz',
      ].filter(Boolean).join('\n'));
      const blob = await zip.generateAsync({ type: 'blob' });
      // Anchor WAJIB di-append ke DOM sebelum click() (Firefox mengabaikan click()
      // pada elemen yang tidak ter-attach) — dan revoke SETELAH remove(), bukan
      // langsung setelah click(), supaya browser sempat mulai membaca blob URL-nya
      // sebelum di-invalidate (audit 2026-07-28; dua path unduh ZIP lain di file
      // ini sudah memakai pola yang benar).
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${kode}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Gagal membuat ZIP'); }
    finally { setZipBusy(false); }
  };

  const JsonBlock = ({ title, obj, narration, k }: { title: string; obj?: Record<string, unknown>; narration?: string; k: string }) => {
    const text = obj ? JSON.stringify(obj, null, 2) : '';
    return (
      <div className="border border-gray-100 rounded-xl p-3 bg-white">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-semibold text-[#0F172A]">{title}</div>
          <button onClick={() => copy(text, k)} className="text-[11px] font-semibold text-[#1565C0] flex items-center gap-1">
            {copied === k ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy JSON</>}
          </button>
        </div>
        {obj && <pre className="text-xs text-[#0F172A] whitespace-pre-wrap break-words font-mono bg-[#F8FAFC] rounded-lg p-2 leading-relaxed">{text}</pre>}
        {narration && <p className="text-xs text-[#1565C0] mt-1.5 italic">🎙️ {narration}</p>}
      </div>
    );
  };
  const TextBlock = ({ title, text, k }: { title: string; text: string; k: string }) => (
    <div className="border border-gray-100 rounded-xl p-3 bg-[#F8FAFC]">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide">{title}</div>
        <button onClick={() => copy(text, k)} className="text-[11px] font-semibold text-[#1565C0] flex items-center gap-1">
          {copied === k ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
        </button>
      </div>
      <pre className="text-xs text-[#0F172A] whitespace-pre-wrap break-words font-mono leading-relaxed">{text}</pre>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
      <div>
        <h2 className="font-display font-bold text-[#0F172A] flex items-center gap-2">📺 YouTube Long — Storyboard Terpandu (16:9)</h2>
        <p className="text-sm text-[#64748B] mt-0.5">Pilih foto + beri label, tentukan gaya visual & kamera. AI menyusun skenario → prompt JSON per blok (thumbnail, opening, scene, ending) siap copy-paste.</p>
      </div>

      {!result && (
        <div className="space-y-4">
          {/* Pilih foto + label (urutan = urutan scene) */}
          <div>
            <div className="text-sm font-medium text-[#0F172A] mb-1.5">1. Pilih foto (klik) — urutan klik = urutan scene</div>
            {photos.length === 0 ? (
              <p className="text-sm text-[#64748B]">Properti ini belum punya foto.</p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {photos.map(im => {
                  const ord = orderOf(im.id);
                  return (
                    <button key={im.id} type="button" onClick={() => togglePhoto(im)}
                      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 80px' }}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${ord ? 'border-[#EF4444] ring-2 ring-red-200' : 'border-transparent hover:border-gray-300'}`}>
                      <img src={thumbSrc(im.url_webp, 160)} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      {ord && <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-[#EF4444] text-white text-[11px] font-bold flex items-center justify-center">{ord}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Label per foto terpilih */}
          {selected.length > 0 && (
            <div>
              <div className="text-sm font-medium text-[#0F172A] mb-1.5">2. Beri label tiap foto (ruangan/area)</div>
              <div className="space-y-1.5">
                {selected.map(s => (
                  <div key={s.id} className="flex items-center gap-2">
                    <img src={thumbSrc(s.url_webp, 80)} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                    <div className="flex-1"><LabelSelect value={s.label} onChange={v => setLabel(s.id, v)} options={PHOTO_LABELS} placeholder="— Label —" /></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gaya */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-sm font-medium text-[#0F172A] mb-1.5">3. Gaya Visual</div>
              <select value={visualStyle} onChange={e => setVisualStyle(e.target.value)} className={selectCls}>
                {VISUAL_STYLES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <div className="text-sm font-medium text-[#0F172A] mb-1.5">4. Gaya Kamera / Drone</div>
              <select value={cameraStyle} onChange={e => setCameraStyle(e.target.value)} className={selectCls}>
                {YT_CAMERA.map(c => <option key={c.value} value={c.value}>{c.label}{c.risiko ? ' ⚠' : ''}</option>)}
              </select>
              {YT_CAMERA.find(c => c.value === cameraStyle)?.risiko && (
                <p className="mt-1 text-[11px] text-amber-700 leading-relaxed">
                  ⚠️ Gerakan drone/aerial membawa kamera keluar bingkai foto, sehingga AI harus mengarang
                  area yang tidak ada di gambar Anda. Prompt sudah menahannya, tapi <strong>Gimbal</strong> atau
                  <strong> Static</strong> memberi hasil paling setia pada foto.
                </p>
              )}
            </div>
          </div>

          {/* Bahasa narasi + opsi agen */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-sm font-medium text-[#0F172A] mb-1.5">5. Bahasa Dialog / Narasi</div>
              <select value={language} onChange={e => setLanguage(e.target.value === 'en' ? 'en' : 'id')} className={selectCls}>
                <option value="id">Bahasa Indonesia (default)</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <div className="text-sm font-medium text-[#0F172A] mb-1.5">6. Agen dalam Video</div>
              <select value={useAgent ? 'agent' : 'none'} onChange={e => { const on = e.target.value === 'agent'; setUseAgent(on); if (!on) setAgentId(null); }} className={selectCls}>
                <option value="none">Tanpa agen — video rumah saja</option>
                <option value="agent">Tampilkan agen (pakai foto referensi)</option>
              </select>
            </div>
          </div>

          {useAgent && (
            <div>
              <div className="text-sm font-medium text-[#0F172A] mb-1.5">Pilih agen — fotonya jadi reference image di semua blok</div>
              {agents === null ? (
                <p className="text-sm text-[#64748B]">Memuat daftar agen…</p>
              ) : agents.length === 0 ? (
                <p className="text-sm text-[#64748B]">Belum ada agen tersimpan. Tambahkan lewat workspace ViralFrame → Step 2 (Karakter).</p>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {agents.map(a => (
                    <button key={a.id} type="button" onClick={() => setAgentId(a.id)} title={a.nama}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${agentId === a.id ? 'border-[#EF4444] ring-2 ring-red-200' : 'border-transparent hover:border-gray-300'}`}>
                      {a.foto_url
                        ? <img src={thumbSrc(a.foto_url, 160)} alt={a.nama} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                        : <span className="w-full h-full flex items-center justify-center bg-gray-100 text-[#94A3B8]"><ImageOff size={18} /></span>}
                      <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] px-1 py-0.5 truncate">{a.nama}</span>
                      {agentId === a.id && <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-[#EF4444] text-white flex items-center justify-center"><Check size={12} /></span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button onClick={generate} disabled={loading || !ready}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #EF4444 0%, #F97316 100%)' }}>
            {loading ? <><Loader2 size={16} className="animate-spin" /> Menyusun storyboard…</> : <>✨ Generate Storyboard ({selected.length} scene)</>}
          </button>
          {loading && (
            <div className="space-y-1.5">
              <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.round(progress)}%`, background: 'linear-gradient(90deg,#EF4444,#F97316)' }} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-[#64748B] flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> Menyusun storyboard… ({Math.round(progress)}%)
                </p>
                <button type="button" onClick={cancelGenerate}
                  className="shrink-0 px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-[#64748B] hover:bg-gray-50 transition-colors">
                  Batalkan
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-emerald-600">✅ Storyboard siap untuk {propertyTitle}</span>
            <div className="flex items-center gap-3 flex-shrink-0">
              <button onClick={downloadZip} disabled={zipBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#1565C0] hover:bg-[#1565C0]/90 disabled:opacity-50">
                {zipBusy ? <><Loader2 size={13} className="animate-spin" /> Membuat ZIP…</> : <><FileArchive size={13} /> Download ZIP</>}
              </button>
              <button onClick={() => { setResult(null); setProgress(0); }} className="text-xs text-[#1565C0] underline">Buat ulang</button>
            </div>
          </div>
          <p className="text-[11px] text-[#94A3B8]">
            {result.provider_used && <>Digenerate oleh {result.provider_used} · </>}
            Narasi: {result.language === 'en' ? 'English' : 'Bahasa Indonesia'}
            {result.agent && <> · Agen: {result.agent.nama}</>}
            {' '}· ZIP berisi prompt JSON per blok + narasi + foto referensi{result.agent ? ' + foto agen' : ''}
          </p>

          {Array.isArray(result.titles) && result.titles.length > 0 && (
            <TextBlock title="Judul Video (pilih 1)" k="titles" text={result.titles.map((t, i) => `${i + 1}. ${t}`).join('\n')} />
          )}
          {result.description && <TextBlock title="Deskripsi + Chapters" k="desc" text={`${result.description}\n\n${(result.chapters_timestamp ?? []).join('\n')}`} />}

          {result.thumbnail?.prompt && <JsonBlock title="🖼️ Prompt JSON — Thumbnail" k="thumb" obj={result.thumbnail.prompt} />}
          {result.opening?.prompt && <JsonBlock title="▶️ Prompt JSON — Opening Video" k="open" obj={result.opening.prompt} narration={result.opening.narration_id} />}

          <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide pt-1">Scenes ({result.scenes?.length ?? 0})</div>
          {(result.scenes ?? []).map(s => (
            <div key={s.scene} className="border border-gray-100 rounded-xl p-3 bg-white space-y-2">
              <div className="flex items-center gap-2">
                {s.url_webp && <img src={thumbSrc(s.url_webp, 120)} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0" />}
                <span className="text-xs font-semibold text-[#0F172A] flex-1">Scene {s.scene} · {s.photo_label ?? ''}</span>
                <button onClick={() => copy(JSON.stringify(s.prompt ?? {}, null, 2), `s-${s.scene}`)} className="text-[11px] font-semibold text-[#1565C0] flex items-center gap-1">
                  {copied === `s-${s.scene}` ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy JSON</>}
                </button>
              </div>
              {s.prompt && <pre className="text-xs text-[#0F172A] whitespace-pre-wrap break-words font-mono bg-[#F8FAFC] rounded-lg p-2 leading-relaxed">{JSON.stringify(s.prompt, null, 2)}</pre>}
              {s.narration_id && <p className="text-xs text-[#1565C0] italic">🎙️ {s.narration_id}</p>}
            </div>
          ))}

          {result.ending?.prompt && <JsonBlock title="⏹️ Prompt JSON — Ending Video" k="end" obj={result.ending.prompt} narration={result.ending.narration_id} />}
          {result.caption && <TextBlock title="Caption" k="cap" text={result.caption} />}
          {Array.isArray(result.hashtag_sets) && result.hashtag_sets.length > 0 && (
            <TextBlock title="Hashtag (5 kombinasi)" k="tags" text={result.hashtag_sets.join('\n')} />
          )}
        </div>
      )}
    </div>
  );
}
const YouTubeLongViewMemo = memo(YouTubeLongView);

// #2: versi memo dari tab berat — hanya re-render bila prop berubah (prop-nya
// distabilkan via useMemo/useCallback di parent), bukan tiap parent re-render.
const AIGenerateTabMemo = memo(AIGenerateTab);

export default function AdminViralFrameWorkspacePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  // Mode (AI Generate / Manual / YouTube Long) dulu dipilih via modal + query
  // ?mode= SEBELUM wizard dimulai. Sekarang jadi Step 3 di dalam wizard sendiri
  // (lihat render step===3 di bawah) — state lokal, bukan lagi dari URL.
  const [mode, setMode] = useState<'ai-generate' | 'manual' | 'youtube-long' | null>(null);
  const isAIGenerateMode = mode === 'ai-generate';

  const [prop, setProp] = useState<PropertyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Wizard = accordion (2026-08-01). `step` bukan lagi "halaman yang sedang
  // ditampilkan" melainkan "section yang sedang TERBUKA"; section lain tetap
  // ter-render sebagai header tertutup dan bisa dibuka kapan saja.
  // Index section: 0 Label Foto · 1 Karakter · 2 Mode
  //                3 Parameter Video · 4 Generate Prompt
  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);

  // YouTube Long mengganti isi section Generate (bukan cuma pre-select tab) —
  // baru aktif setelah section Mode dilewati, supaya kartu pilihan mode itu
  // sendiri masih sempat ter-render.
  const isYoutubeLongMode = mode === 'youtube-long' && step > 2;

  // selectedForVideo = pool foto yang dicentang "jadi bahan". AI Rancang
  // Storyboard hanya boleh menugaskan foto dari pool ini.
  const [selectedForVideo, setSelectedForVideo] = useState<Set<number>>(new Set());
  const toggleSelectedForVideo = (photoId: number) => {
    setSelectedForVideo(prev => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId); else next.add(photoId);
      return next;
    });
  };

  // Default sesi BARU (model Part-as-Generate-Unit, refactor 2026-08-01): user
  // merancang Part + durasi + durasi VO-nya, AI ("AI Rancang Storyboard", Section
  // Parameter Video) yang menentukan cuts/foto referensi tiap Part. Part awal
  // mencerminkan struktur Hook/Body/CTA klasik sebagai titik mulai (cuts kosong)
  // — akan ditimpa begitu AI Rancang Storyboard dijalankan. Draft/riwayat LAMA
  // ({durationMode,sceneCount,scenes[],...}) dikonversi lewat konversiDraftLama()
  // di applyConfig(), TIDAK dibaca langsung di sini.
  const [s1, setS1] = useState<Step1State>({
    // Default pilihan user (2026-08-02): 3 Part × 10 detik, VO 8 detik.
    // Total 30 detik — panjang yang pas untuk Reels/Shorts/TikTok, dan sisa 2 detik
    // per Part memberi ruang hook text/transisi/end card (lihat Catatan Produksi).
    //
    // Default LAMA (Hook 8/8, Body 20/20, CTA 8/8) punya bug: Body 20 detik
    // MELANGGAR getClipMaxSec('google_flow') = 10 yang justru dipaksakan UI lewat
    // atribut `max` — jadi sesi baru selalu dimulai dengan Part yang tidak valid.
    // voDurationSec juga = durationSec, artinya VO memenuhi seluruh durasi dan
    // tidak menyisakan ruang untuk end card.
    parts: [
      { role: 'Hook', durationSec: 10, voDurationSec: 8, refPhotoIds: [], cuts: [] },
      { role: 'Body', durationSec: 10, voDurationSec: 8, refPhotoIds: [], cuts: [] },
      { role: 'CTA', durationSec: 10, voDurationSec: 8, refPhotoIds: [], cuts: [] },
    ],
    platforms: ['tiktok', 'ig_reels', 'yt_shorts', 'fb_reels'],
    aiTool: 'google_flow',
    ratio: '9:16',
    language: 'id',
    hookType: 'auto',
    ctaType: 'auto',
    ctaKeyword: '',
    visualStyle: 'auto',
    tone: 'auto',
    niche: 'real_estate',
    archetype: ARCHETYPE_CUSTOM_ID,
    register: 'auto',
    cutawayExcluded: [],
  });
  const [s3, setS3] = useState<Step3State>({
    useCharacter: false,
    characterId: null,
    visualAnchor: '',
    // Default eksplisit pilihan user (2026-07-28), bukan 'auto' — arketipe juga
    // sudah tidak menimpanya lagi (lihat applyArchetype). Draft/riwayat lama yang
    // menyimpan 'auto' tetap dihormati saat rehydrate.
    expression: 'excited_joyful',
  });
  const update3 = useCallback((patch: Partial<Step3State>) =>
    setS3(prev => ({ ...prev, ...patch })), []);

  // ─── Tahap 1: Autosave draft (localStorage) + Riwayat (D1) ──────────────────
  const draftKey = id ? `vf_draft_${id}` : '';
  const [draftFound, setDraftFound] = useState<{ ts: number } | null>(null);
  const [hydrated, setHydrated] = useState(false); // true = boleh autosave (draft sudah diputuskan / tak ada)

  // Bentuk konfigurasi tersimpan bisa LAMA ({s1:{durationMode,sceneCount,...},
  // scenes:[...]}) atau BARU ({s1:{parts:PartDef[]...}}) — draft localStorage
  // (`vf_draft_<id>`) dan riwayat D1 (`viralframe_generations.params_json`)
  // sama-sama bisa berisi format lama, dan itu TIDAK BOLEH membuat halaman rusak.
  interface LegacyOrNewCfg {
    s1?: (Partial<Step1State> & Partial<DraftLamaS1> & { parts?: unknown }) | null;
    scenes?: DraftLamaScene[];
    s3?: Partial<Step3State>;
  }
  // Terapkan konfigurasi tersimpan ke state — merge defensif, dengan konversi
  // otomatis format lama → PartDef[] (Tahap 1, konversiDraftLama()).
  const applyConfig = useCallback((cfg: LegacyOrNewCfg | null) => {
    if (!cfg) return;
    if (cfg.s1) {
      const s1Raw = cfg.s1;
      // Deteksi bentuk lama TIDAK cukup hanya dari `durationMode`/`scenes`. Draft
      // yang tersimpan DI TENGAH refactor punya `parts` ber-`sceneCount` tanpa
      // `cuts`/`refPhotoIds` — dulu lolos ke cabang "baru", masuk state mentah,
      // lalu render meledak di `p.refPhotoIds.length` (layar putih, 2026-08-01).
      const partsRaw = (s1Raw as { parts?: unknown }).parts;
      const partsBentukLama = Array.isArray(partsRaw) && partsRaw.some(p => {
        const o = (p ?? {}) as Record<string, unknown>;
        return 'sceneCount' in o || !Array.isArray(o.cuts);
      });
      const isLegacy = 'durationMode' in s1Raw || Array.isArray(cfg.scenes) || partsBentukLama;
      if (isLegacy) {
        const convertedParts = konversiDraftLama(s1Raw as DraftLamaS1, cfg.scenes ?? [], (s1Raw as { aiTool?: string }).aiTool);
        const {
          durationMode: _dm, sceneCount: _sc, uniformDuration: _ud, manualDurations: _md, parts: _pt,
          ...rest
        } = s1Raw as Record<string, unknown>;
        setS1(prev => ({ ...prev, ...(rest as Partial<Step1State>), parts: convertedParts }));
      } else {
        // Bentuk baru pun TETAP dinormalisasi: state persisten adalah input tidak
        // tepercaya (bisa dari build versi mana pun yang pernah dipakai user).
        // `cutawayExcluded` juga dijaga agar selalu array — dibaca .includes()/.length
        // di render dan di payload suggest-storyboard.
        const s1Obj = s1Raw as Record<string, unknown>;
        setS1(prev => ({
          ...prev,
          ...(s1Raw as Partial<Step1State>),
          parts: normalisasiParts(s1Obj.parts, s1Obj.aiTool as string | undefined),
          cutawayExcluded: Array.isArray(s1Obj.cutawayExcluded)
            ? (s1Obj.cutawayExcluded as unknown[]).map(Number).filter(Number.isFinite)
            : prev.cutawayExcluded,
        }));
      }
    }
    if (cfg.s3) setS3(prev => ({ ...prev, ...cfg.s3 }));
  }, []);

  // Cek draft tersimpan saat id siap (belum autosave sebelum user memutuskan).
  useEffect(() => {
    if (!draftKey) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw);
        if (d?.s1) { setDraftFound({ ts: d.ts ?? 0 }); return; }
      }
    } catch { /* ignore */ }
    setHydrated(true);
  }, [draftKey]);

  const restoreDraft = () => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) applyConfig(JSON.parse(raw));
    } catch { /* ignore */ }
    setDraftFound(null); setHydrated(true);
  };
  const dismissDraft = () => {
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    setDraftFound(null); setHydrated(true);
  };

  // Autosave debounced (hanya setelah draft diputuskan agar tak menimpa draft lama).
  // Tidak lagi menyimpan `scenes` terpisah (dihapus Tahap 4) — foto/label sekarang
  // hidup DI DALAM s1.parts[].cuts[], jadi {s1,s3} sudah lengkap merepresentasikan sesi.
  const autosaveSrc = useMemo(() => ({ s1, s3 }), [s1, s3]);
  const debouncedAutosave = useDebouncedValue(autosaveSrc, 800);
  useEffect(() => {
    if (!draftKey || !hydrated) return;
    try { localStorage.setItem(draftKey, JSON.stringify({ ...debouncedAutosave, ts: Date.now() })); } catch { /* ignore */ }
  }, [draftKey, hydrated, debouncedAutosave]);

  // Riwayat generate (D1) per properti.
  interface GenItem { id: number; params_json: string | null; master_prompt: string | null; result_json: string | null; created_at: string }
  const [history, setHistory] = useState<GenItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Berapa kali tiap arketipe dipakai di N generate TERAKHIR properti ini.
  // Dipakai untuk badge "sudah dipakai N generate terakhir" di picker arketipe —
  // MEMBERI TAHU, bukan memaksa. Rotasi gaya adalah salah satu dari sedikit sumbu
  // yang boleh bervariasi antar video tanpa merusak kesetiaan ke foto referensi
  // (pencahayaan/waktu/cuaca TIDAK boleh — lihat variasiBlock di ai-generate.js).
  const RIWAYAT_ARKETIPE_N = 5;
  const pemakaianArketipe = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of history.slice(0, RIWAYAT_ARKETIPE_N)) {
      if (!h.params_json) continue;
      try {
        const p = JSON.parse(h.params_json) as { archetype?: string; s1?: { archetype?: string } };
        // Toleran dua bentuk, sama seperti pembaca exclusion di ai-generate.js.
        // Bentuk yang tidak cocok persis inilah akar bug "anti-pengulangan tidak
        // pernah jalan" (2026-08-02) — jangan ulangi asumsi bentuk tunggal.
        const arc = p?.s1?.archetype ?? p?.archetype;
        if (typeof arc === 'string' && arc) map.set(arc, (map.get(arc) ?? 0) + 1);
      } catch { /* baris rusak — abaikan */ }
    }
    return map;
  }, [history]);

  /**
   * Pilih musik untuk mode 'auto' — least-recently-used dari riwayat generate.
   *
   * ⚠️ WAJIB dideklarasikan SETELAH state `history`. Ditaruh sebelumnya, identifier
   * `history` diam-diam teresolve ke `window.history` (global DOM) — typecheck
   * menangkapnya sebagai "Property 'forEach' does not exist on type 'History'",
   * tapi kalau kebetulan lolos tipe, hasilnya TDZ error saat render.
   *
   * Mereplikasi pola rotasi foto di suggest-storyboard.js (lastUsedIdx):
   *  - riwayat ditelusuri TERBARU DULU, `idx` = umur generate (0 = paling baru);
   *  - "first write wins" → map menyimpan pemakaian TERAKHIR tiap nilai;
   *  - belum pernah dipakai = Infinity → prioritas tertinggi;
   *  - perbandingan `>` ketat, jadi saat seri urutan daftar jadi penentu (stabil).
   *
   * Kenapa rotasi ini ada: string musik BEKU per opsi dan ditempel di akhir SETIAP
   * prompt dengan perintah "JANGAN dimodifikasi", sehingga tanpa rotasi seluruh
   * video di akun punya karakter audio yang identik.
   */
  const pilihMusikRotasi = useCallback((): string => {
    const terakhirDipakai = new Map<string, number>();
    history.forEach((h, idx) => {
      if (!h.params_json) return;
      try {
        const p = JSON.parse(h.params_json) as { musik_value?: string; s1?: { musik?: string } };
        // Toleran dua bentuk penulis (Jalur C vs frontend), seperti pembaca lain.
        const v = p?.musik_value ?? p?.s1?.musik;
        if (typeof v === 'string' && v && !terakhirDipakai.has(v)) terakhirDipakai.set(v, idx);
      } catch { /* baris rusak — abaikan */ }
    });
    let pilih = MUSIK_ROTASI_VALUES[0];
    let pilihIdx = terakhirDipakai.get(pilih) ?? Infinity;
    for (const kand of MUSIK_ROTASI_VALUES.slice(1)) {
      const kandIdx = terakhirDipakai.get(kand) ?? Infinity;
      if (kandIdx > pilihIdx) { pilih = kand; pilihIdx = kandIdx; }
    }
    return pilih;
  }, [history]);
  const loadHistory = useCallback(async () => {
    if (!id) return;
    try {
      const r = await fetch(`/api/admin/viralframe/generations?property_id=${id}`, { credentials: 'include' });
      const j = await bacaJson(r);
      if (j.success) setHistory(j.data?.items ?? []);
    } catch { /* ignore */ }
  }, [id]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const [deletingHistoryId, setDeletingHistoryId] = useState<number | 'all' | null>(null);
  const deleteHistoryItem = async (hid: number) => {
    if (!window.confirm(`Hapus riwayat #${hid}? Tindakan ini tidak bisa dibatalkan.`)) return;
    setDeletingHistoryId(hid);
    try {
      const r = await fetch(`/api/admin/viralframe/generations/${hid}`, { method: 'DELETE', credentials: 'include' });
      const j = await bacaJson(r);
      if (j.success) setHistory(prev => prev.filter(h => h.id !== hid));
    } catch { /* ignore */ }
    setDeletingHistoryId(null);
  };
  const clearHistory = async () => {
    if (!id) return;
    if (!window.confirm(`Hapus SEMUA ${history.length} riwayat properti ini? Tindakan ini tidak bisa dibatalkan.`)) return;
    setDeletingHistoryId('all');
    try {
      const r = await fetch(`/api/admin/viralframe/generations?property_id=${id}`, { method: 'DELETE', credentials: 'include' });
      const j = await bacaJson(r);
      if (j.success) { setHistory([]); setShowHistory(false); }
    } catch { /* ignore */ }
    setDeletingHistoryId(null);
  };

  // R11: Preset tim (parameter Step 3). Preset = parameter visual SAJA — sceneCount
  // dan parts SENGAJA tidak ikut: sejak reorder wizard keduanya milik Step 1 (Foto),
  // dan menerapkan preset ber-sceneCount berbeda dari Step 3 akan me-resize scenes[]
  // alias menghapus foto yang sudah dipilih user. Preset lama yang terlanjur
  // menyimpan field struktur tetap bisa dimuat — fieldnya diabaikan saat apply.
  interface PresetItem { name: string; params: Partial<Step1State>; updated_at?: string }
  const [presets, setPresets] = useState<PresetItem[]>([]);
  const loadPresets = useCallback(async () => {
    try { const r = await fetch('/api/admin/viralframe/presets', { credentials: 'include' }); const j = await bacaJson(r); if (j.success) setPresets(j.data?.items ?? []); } catch { /* noop */ }
  }, []);
  useEffect(() => { loadPresets(); }, [loadPresets]);
  const savePreset = async () => {
    const name = window.prompt('Nama preset (mis. "Kost Mahasiswa TikTok"):');
    if (!name?.trim()) return;
    const params = {
      archetype: s1.archetype, register: s1.register, tone: s1.tone, visualStyle: s1.visualStyle,
      hookType: s1.hookType, ctaType: s1.ctaType, ctaKeyword: s1.ctaKeyword, platforms: s1.platforms,
      aiTool: s1.aiTool, ratio: s1.ratio, language: s1.language,
      cutawayExcluded: s1.cutawayExcluded,
    };
    try { await fetch('/api/admin/viralframe/presets', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), params }) }); } catch { /* noop */ }
    loadPresets();
  };
  const applyPreset = (name: string) => {
    const p = presets.find(x => x.name === name);
    if (!p) return;
    // Buang field struktur dari preset (lama maupun baru) — Part (s1.parts) SENGAJA
    // tidak ikut preset: preset hanya parameter visual, Part dirancang per sesi.
    const { sceneCount: _sc, parts: _pt, manualDurations: _md, durationMode: _dmode, uniformDuration: _ud, ...visualParams } =
      p.params as Partial<Step1State> & Record<string, unknown>;
    setS1(prev => {
      const next = { ...prev, ...(visualParams as Partial<Step1State>) };
      // Preset IKUT menyimpan `aiTool` (lihat savePreset), sehingga memuat preset
      // bisa mengganti tool tanpa lewat gantiAiTool() — dan Part yang sudah ada
      // tertinggal melebihi batas tool baru (mis. preset Veo3 maks 8s sementara
      // Part masih 10s), lalu ditolak backend 422. Clamp yang sama diterapkan di
      // sini. Jangan menghapus ini tanpa juga menghapus aiTool dari savePreset.
      const maks = getClipMaxSec(next.aiTool) ?? 10;
      return {
        ...next,
        parts: next.parts.map(pt => {
          const dur = Math.min(pt.durationSec, maks);
          return { ...pt, durationSec: dur, voDurationSec: Math.min(pt.voDurationSec, dur) };
        }),
      };
    });
  };

  // ─── Jalur C: derivasi props AIGenerateTab dari state Step 1–3 ───────────────
  // Sejak refactor Part-as-Generate-Unit, ai-generate.js menerima kontrak PART
  // langsung (part_assignments/part_roles/part_durations) — tidak ada lagi
  // adapter "scene virtual". `foto_file` diambil dari buildZipNames() yang SAMA
  // dengan yang menulis ZIP, sehingga nama file di prompt identik dengan isi ZIP.
  const platformForAI = s1.platforms[0] ?? 'tiktok';
  const partSpecsForAI: PartSpecForAI[] = useMemo(() => {
    if (!prop) return [];
    const imgById = new Map(prop.images.map(im => [im.id, im]));
    const nameMap = buildZipNames(prop.images);
    return (s1.parts ?? []).map((p, pi) => ({
      part: pi + 1,
      role: p.role,
      durasi: p.durationSec,
      vo_durasi: p.voDurationSec,
      label: p.label,
      cuts: p.cuts
        .map(c => {
          const img = imgById.get(c.photoId);
          const file = nameMap.get(c.photoId);
          if (!img || !file || !c.label) return null;
          return {
            foto_url: img.url_webp,
            foto_label: PHOTO_LABEL_TO_FOTO_LABEL[c.label] ?? 'lainnya',
            foto_file: file,
            durasi: c.durasiDetik,
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null),
    }));
  }, [s1.parts, prop]);

  const selectedKarakterForAI: AISelectedKarakter | null = s3.character
    ? {
        id: s3.character.id,
        nama: s3.character.nama,
        foto_url: s3.character.foto_url,
        deskripsi: [s3.character.gender, s3.character.usia ? `${s3.character.usia} tahun` : null, s3.character.etnik, s3.character.style ? `gaya ${s3.character.style}` : null, s3.character.ciri_fisik]
          .filter(Boolean).join(', ') || 'tidak ada deskripsi khusus',
        expression: s3.expression,
      }
    : null;
  // Step 4 — compile + save history
  const [copied, setCopied] = useState(false);
  const [generationId, setGenerationId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const savedPromptRef = useRef<string>('');

  // Step 4 — Tab Paste & Validate (Fase V4b)
  const [step4Tab, setStep4Tab] = useState<'prompt' | 'validate' | 'ai_generate' | 'upload'>('prompt');
  const [pasteRaw, setPasteRaw] = useState('');
  const [valResult, setValResult] = useState<ValidateResult | null>(null);
  const [validData, setValidData] = useState<ParsedJSON | null>(null);
  const [warningsDismissed, setWarningsDismissed] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [zipError, setZipError] = useState('');

  // Fetch detail properti
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true); setError('');
      try {
        const res = await fetch(`/api/admin/properties/${id}`, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await bacaJson(res);
        if (!cancel) setProp(json.data ?? null);
      } catch (err: unknown) {
        if (!cancel) setError(err instanceof Error ? err.message : 'Gagal memuat properti');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [id]);

  // Mode dipilih di Step 3 (bukan lagi dari URL) — begitu user sampai di Step 5
  // (Generate) secara natural, tab yang sesuai mode sudah aktif duluan.
  useEffect(() => {
    if (isAIGenerateMode) {
      setStep4Tab('ai_generate');
    }
  }, [isAIGenerateMode]);

  const update1 = <K extends keyof Step1State>(key: K, val: Step1State[K]) =>
    setS1(prev => ({ ...prev, [key]: val }));

  // ─── Part designer (model Part-as-Generate-Unit, refactor 2026-08-01) ───────
  // Part sekarang SATU-SATUNYA struktur (bukan lagi turunan dari sceneCount).
  // updatePart/addPart/removePart menulis s1.parts langsung — tidak ada lagi
  // resize scenes[]/manualDurations (dihapus) karena cuts hidup DI DALAM Part.
  const clipMaxForTool = getClipMaxSec(s1.aiTool) ?? 10;
  const addPart = useCallback(() => {
    setS1(prev => {
      // Selaras dengan default sesi baru: durasi penuh sesuai batas tool, VO 8 detik
      // (atau lebih pendek bila tool-nya cuma memuat < 8s) sehingga selalu tersisa
      // ruang untuk end card. Dulu voDurationSec = durationSec — VO memenuhi seluruh
      // durasi dan tidak menyisakan apa pun.
      const dur = clipMaxForTool;
      const vo = Math.min(8, dur);
      const role: PartDef['role'] = prev.parts.length === 0 ? 'Hook' : 'Body';
      return { ...prev, parts: [...prev.parts, { role, durationSec: dur, voDurationSec: vo, refPhotoIds: [], cuts: [] }] };
    });
  }, [clipMaxForTool]);
  /**
   * Ganti AI Video Tool SEKALIGUS memotong durasi Part yang melebihi batas tool baru.
   *
   * Tanpa ini, berpindah dari Google Flow (maks 10s) ke Veo3 (maks 8s) meninggalkan
   * Part 10 detik yang tidak valid: UI menampilkannya seolah baik-baik saja (atribut
   * `max` hanya membatasi input BARU, tidak memperbaiki nilai lama), lalu
   * suggest-storyboard menolak dengan 422 "Durasi tiap Part harus 1-8 detik".
   * Bug ini makin gampang kena sejak default sesi baru jadi 10 detik.
   */
  const gantiAiTool = useCallback((tool: string) => {
    setS1(prev => {
      const maks = getClipMaxSec(tool) ?? 10;
      return {
        ...prev,
        aiTool: tool,
        parts: prev.parts.map(p => {
          const dur = Math.min(p.durationSec, maks);
          return { ...p, durationSec: dur, voDurationSec: Math.min(p.voDurationSec, dur) };
        }),
      };
    });
  }, []);

  const removePart = useCallback((idx: number) => {
    setS1(prev => ({ ...prev, parts: prev.parts.filter((_, i) => i !== idx) }));
  }, []);
  const updatePart = useCallback((idx: number, patch: Partial<PartDef>) => {
    setS1(prev => ({ ...prev, parts: prev.parts.map((p, i) => (i === idx ? { ...p, ...patch } : p)) }));
  }, []);

  // ─── AI Rancang Storyboard (sutradara AI bervisi, Tahap 2 Agent 2) ──────────
  // Sekali klik: kirim rancangan Part (role/durationSec/voDurationSec DIKUNCI
  // user) ke suggest-storyboard.js — AI (bervisi bila memungkinkan, degradasi
  // teks-saja bila kuota provider bervisi habis) menentukan cuts[]/refPhotoIds/
  // rationale tiap Part, lalu MENIMPA s1.parts (role/durasi tidak berubah).
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState('');
  const [suggestUsedVision, setSuggestUsedVision] = useState<boolean | null>(null);
  const [suggestProviderUsed, setSuggestProviderUsed] = useState<string>('');

  // ── Pemilih Sumber AI khusus Sutradara AI ──
  // Sengaja punya state SENDIRI, terpisah dari pemilih di tab "AI Generate":
  // keduanya jalan di tahap berbeda dan sering ingin provider berbeda (mis.
  // storyboard butuh yang BERVISI, generate naskah tidak). Menyatukannya akan
  // membuat memilih di satu tempat diam-diam mengubah yang lain.
  const [suggestProvider, setSuggestProvider] = useState<AiProviderId>('gemini');
  const [suggestModel, setSuggestModel] = useState('');
  const [suggestModels, setSuggestModels] = useState<string[]>([]);
  const [suggestModelsLoading, setSuggestModelsLoading] = useState(false);
  const [suggestAiStatus, setSuggestAiStatus] = useState<Record<string, AiStatusInfo> | null>(null);

  useEffect(() => { getAiStatus().then(r => { if (r.success && r.data) setSuggestAiStatus(r.data); }); }, []);
  useEffect(() => {
    setSuggestModelsLoading(true);
    setSuggestModels([]);
    getAiModels(suggestProvider).then(r => {
      const list = r.success && r.data ? r.data.models : [];
      setSuggestModels(list);
      setSuggestModel(list[0] ?? '');
    }).finally(() => setSuggestModelsLoading(false));
  }, [suggestProvider]);
  const suggestStoryboard = useCallback(async () => {
    if (!prop) return;
    setSuggestLoading(true); setSuggestError('');
    try {
      const r = await fetch('/api/admin/viralframe/suggest-storyboard', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: prop.id,
          // `talkingHead` WAJIB ikut terkirim. Tanpa ini sutradara AI tidak tahu
          // Part mana yang diset "Talking-Head Saja" di UI, lalu merancang cutaway
          // b-roll untuk Part yang seharusnya presenter murni — dan pada kasus
          // terburuk menyebut foto karakter sebagai label cut, yang ditolak
          // validator (422). Nomor Part di cutawayExcluded 1-based.
          parts: s1.parts.map((p, i) => ({
            role: p.role, durationSec: p.durationSec, voDurationSec: p.voDurationSec, label: p.label,
            talkingHead: s1.cutawayExcluded.includes(i + 1),
          })),
          archetype: s1.archetype,
          // Sama persis dengan yang sudah dikirim ke ai-generate.js (baris ~677) —
          // TANPA ini sutradara AI tidak tahu arketipe hybrid (mis. selfie_luxury_hybrid)
          // butuh minimal 2 cut per Part (BAGIAN 1 selfie + BAGIAN 2 b-roll), dan
          // cenderung merancang 1 cut saja (dilaporkan user 2026-08-16).
          multi_shot_scene: findArchetype(s1.archetype)?.allowMultiShotPerScene === true,
          register: s1.register,
          character_photo_url: s3.useCharacter ? (s3.character?.foto_url ?? undefined) : undefined,
          ai_tool: s1.aiTool,
          // BRIEF KREATIF — dulu tidak satu pun dari ini terkirim, sehingga sutradara
          // AI merancang tanpa tahu tipe hook/CTA/platform/tone dan hasilnya generik.
          // `rasio` SENGAJA TIDAK dikirim: aspect ratio adalah setelan di Google Flow,
          // bukan sesuatu yang perlu diulang di dalam prompt.
          hook_type: s1.hookType,
          cta_type: s1.ctaType,
          cta_keyword: s1.ctaKeyword || undefined,
          platforms: s1.platforms,
          tone: s1.tone,
          visual_style: s1.visualStyle,
          bahasa: s1.language,
          // Provider & model pilihan user. Keduanya hanya PREFERENSI — backend
          // tetap punya rantai fallback bila pilihan ini gagal/kehabisan kuota.
          provider: suggestProvider,
          model: suggestModel || undefined,
        }),
      });
      const data = await readNdjsonFinal<{ parts: PartDef[]; provider_used: string; used_vision: boolean }>(r);
      // Penjaga runtime — readNdjsonFinal<T>() hanya meng-CAST, tidak memvalidasi.
      // Tanpa ini, backend yang mengganti nama field membuat `s1.parts` jadi
      // undefined lalu render meledak di `s1.parts.map` → LAYAR PUTIH. Persis pola
      // insiden `parts`/`scenes` di ai-generate (2026-08-01); call site ini satu-
      // satunya yang saat itu belum ikut dijaga.
      if (!Array.isArray(data?.parts)) {
        throw new Error('Respons AI tidak sesuai kontrak: field "parts" tidak ditemukan. Ini bug integrasi frontend↔backend, bukan kesalahan input — laporkan ke pengembang.');
      }
      setS1(prev => ({ ...prev, parts: normalisasiParts(data.parts, prev.aiTool) }));
      setSuggestUsedVision(data.used_vision);
      setSuggestProviderUsed(data.provider_used);
    } catch (e: unknown) {
      setSuggestError(e instanceof Error ? e.message : 'Gagal rancang storyboard');
    } finally {
      setSuggestLoading(false);
    }
  }, [prop, s1.parts, s1.archetype, s1.register, s1.aiTool, s1.cutawayExcluded,
      s1.hookType, s1.ctaType, s1.ctaKeyword, s1.platforms, s1.tone, s1.visualStyle, s1.language,
      s3.useCharacter, s3.character, suggestProvider, suggestModel]);

  // Pilih arketipe → prefill visualStyle/tone/register/cutaway (parameter Step 3 saja).
  // Nilai tetap bisa di-override manual setelahnya (memilih 'custom' tidak mereset).
  // SENGAJA tidak menyentuh s3: sejak reorder wizard, karakter & ekspresi dipilih di
  // Step 2 SEBELUM arketipe — menimpanya di sini berarti membuang pilihan user tanpa
  // peringatan. Varian B di Style Pair A/B tetap memakai default arketipe (itu
  // derivasi compile s3B, bukan state user).
  // Arketipe hybrid (allowMultiShotPerScene): default scene terakhir (CTA) DIKECUALIKAN
  // dari cutaway — jadi talking-head/selfie murni sebagai penutup. User bisa override
  // per scene lewat toggle "Per-Scene: Cutaway B-Roll" di bawah picker arketipe.
  // "Preset Selanjutnya" — rotasi archetype berdasarkan riwayat generate PROPERTI INI
  // (history sudah difilter per property_id, lihat loadHistory di atas). Prioritas:
  // 1) archetype yang belum pernah dipakai sama sekali, 2) kalau semua 9 sudah pernah,
  // pilih yang PALING LAMA tidak dipakai (round robin) — supaya generate ulang untuk
  // properti yang sama tidak terasa monoton/generik di feed sosmed.
  const pilihPresetSelanjutnya = () => {
    const lastSeenIdx = new Map<string, number>();
    history.forEach((h, idx) => {
      if (!h.params_json) return;
      try {
        const p = JSON.parse(h.params_json);
        if (p?.archetype && !lastSeenIdx.has(p.archetype)) lastSeenIdx.set(p.archetype, idx);
      } catch { /* riwayat lama/rusak — lewati */ }
    });
    const belumPernah = ARCHETYPES.find(a => !lastSeenIdx.has(a.id));
    if (belumPernah) { applyArchetype(belumPernah.id); return; }
    let paling = ARCHETYPES[0];
    let palingIdx = -1;
    for (const a of ARCHETYPES) {
      const idx = lastSeenIdx.get(a.id) ?? Infinity;
      if (idx > palingIdx) { palingIdx = idx; paling = a; }
    }
    applyArchetype(paling.id);
  };

  const applyArchetype = (id: string) => {
    const arc = findArchetype(id);
    if (!arc) { setS1(prev => ({ ...prev, archetype: ARCHETYPE_CUSTOM_ID, cutawayExcluded: [] })); return; }
    setS1(prev => ({
      ...prev,
      archetype: id,
      visualStyle: arc.defaults.visualStyle,
      tone: arc.defaults.tone,
      register: arc.defaults.register ?? prev.register,
      // cutawayExcluded sekarang berisi nomor PART (1-based), bukan scene — default
      // Part TERAKHIR (CTA) dikecualikan dari cutaway (talking-head/selfie penutup).
      cutawayExcluded: arc.allowMultiShotPerScene ? [prev.parts.length] : [],
    }));
  };

  // Toggle satu PART (bukan lagi scene) masuk/keluar dari daftar pengecualian cutaway.
  const toggleCutawayExcluded = (partNum: number) => {
    setS1(prev => {
      const has = prev.cutawayExcluded.includes(partNum);
      return { ...prev, cutawayExcluded: has ? prev.cutawayExcluded.filter(x => x !== partNum) : [...prev.cutawayExcluded, partNum].sort((a, b) => a - b) };
    });
  };

  const togglePlatform = (value: string) => {
    setS1(prev => {
      const has = prev.platforms.includes(value);
      const platforms = has ? prev.platforms.filter(p => p !== value) : [...prev.platforms, value];
      return { ...prev, platforms };
    });
  };

  // Simpan label ruangan foto — persist ke property_images.label_ruangan
  // (sama endpoint yang dipakai kartu foto di Detail Properti, lihat PropertyPhotosCard.tsx)
  // supaya user tidak perlu bolak-balik halaman lain, DAN AI Rancang Storyboard (yang membaca
  // label_ruangan langsung dari DB) langsung bisa dipakai tanpa langkah tambahan. Optimistic:
  // prop.images diperbarui dulu, dikembalikan bila server menolak.
  const savePhotoLabel = (photoId: number, label: string) => {
    if (!prop) return;
    const sebelumnya = prop.images.find(im => im.id === photoId)?.label_ruangan ?? null;
    const nilai = label || null;
    setProp(p => (p ? { ...p, images: p.images.map(im => (im.id === photoId ? { ...im, label_ruangan: nilai } : im)) } : p));
    fetch(`/api/admin/properties/${prop.id}/photos/${photoId}`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label_ruangan: nilai }),
    })
      .then(bacaJson)
      .then(j => { if (!j.success) throw new Error(j.error ?? 'Gagal menyimpan label'); })
      .catch(() => {
        setProp(p => (p ? { ...p, images: p.images.map(im => (im.id === photoId ? { ...im, label_ruangan: sebelumnya } : im)) } : p));
        setSuggestError('Gagal menyimpan label foto ke database. Coba lagi.');
      });
  };

  // ─── Validasi ───────────────────────────────────────────────────────────
  // Urutan wizard (Tahap 4 reorder): 1 Label Foto → 2 Karakter → 3 Pilih Mode →
  // 4 Parameter Video (Part designer + AI Rancang Storyboard pindah ke sini) → 5 Generate.
  // Section 0 sekarang murni Label Foto + centang bahan — validasi Part pindah
  // ke paramErrors (Section 3), tempat kontrolnya sekarang berada.
  const fotoErrors = useMemo(() => {
    const e: string[] = [];
    if (selectedForVideo.size === 0) {
      e.push('Centang minimal 1 foto sebagai bahan video.');
    }
    return e;
  }, [selectedForVideo]);

  const karakterErrors = useMemo(() => {
    const e: string[] = [];
    if (s3.useCharacter && s3.characterId == null) {
      e.push('Pilih atau upload karakter terlebih dahulu.');
    }
    return e;
  }, [s3]);

  const modeErrors = useMemo(() => {
    const e: string[] = [];
    if (mode == null) e.push('Pilih mode generate terlebih dahulu (AI Generate, Manual, atau YouTube Long).');
    return e;
  }, [mode]);

  // Part designer + AI Rancang Storyboard pindah ke Section Parameter Video
  // (Tahap 4 reorder) — validasi Part-nya ikut ke sini.
  const paramErrors = useMemo(() => {
    const e: string[] = [];
    if (s1.platforms.length === 0) e.push('Pilih minimal 1 platform distribusi.');
    const clipMax = getClipMaxSec(s1.aiTool) ?? 999;
    if (s1.parts.length === 0) {
      e.push('Rancang minimal 1 Part terlebih dahulu.');
    } else {
      s1.parts.forEach((p, i) => {
        if (!Number.isFinite(p.durationSec) || p.durationSec <= 0 || p.durationSec > clipMax) {
          e.push(`Part ${i + 1} (${p.role}): durasi harus 1–${clipMax} detik${s1.aiTool ? ` (batas ${s1.aiTool})` : ''}.`);
        }
        if (!Number.isFinite(p.voDurationSec) || p.voDurationSec < 0 || p.voDurationSec > p.durationSec) {
          e.push(`Part ${i + 1} (${p.role}): durasi VO harus 0..durasi Part itu.`);
        }
        if (p.cuts.length === 0) {
          e.push(`Part ${i + 1} (${p.role}): belum ada cuts/foto referensi — jalankan "AI Rancang Storyboard".`);
        }
      });
    }
    if (s1.ctaType === 'comment_keyword' && !s1.ctaKeyword.trim()) {
      e.push('Keyword komentar wajib diisi untuk CTA "Komen [KEYWORD]".');
    }
    return e;
  }, [s1]);

  const LAST_SECTION = 4;
  const errorsFor = (st: number) => (st === 0 ? fotoErrors : st === 1 ? karakterErrors : st === 2 ? modeErrors : st === 3 ? paramErrors : []);
  /** Section dianggap "Lengkap" bila validasinya lolos — dipakai centang header & bar. */
  const sectionDone = useCallback((n: number) => errorsFor(n).length === 0, [fotoErrors, karakterErrors, modeErrors, paramErrors]);

  // Buka section berikutnya (validasi dulu). Section yang ditinggalkan otomatis
  // menutup — hanya satu yang terbuka agar halaman tidak jadi gulungan panjang.
  const goNext = () => {
    if (errorsFor(step).length > 0) { setShowErrors(true); return; }
    setShowErrors(false);
    setStep(s => Math.min(LAST_SECTION, s + 1));
  };
  const goBack = () => {
    setShowErrors(false);
    setStep(s => Math.max(0, s - 1));
  };
  // Klik header / bar indikator: toggle buka-tutup. Melompat MUNDUR selalu boleh;
  // melompat maju juga dibiarkan (tiap section punya validasi sendiri, dan
  // memblokirnya bikin user terjebak tanpa tahu sebabnya).
  const toggleSection = (n: number) => {
    setShowErrors(false);
    setStep(cur => (cur === n ? -1 : n));
  };

  // ─── Compile Master Prompt ──
  // #1: hanya kompilasi saat section Generate benar-benar terbuka, dan pakai
  // input yang di-debounce 300ms — supaya mengetik/memilih di section lain tidak
  // memicu build string besar tiap ketukan (penyebab utama lag).
  const onStep4 = step === LAST_SECTION;
  // `images` WAJIB array yang SAMA PERSIS (id + label_ruangan, urutan sama) dipakai
  // di SETIAP jalur ZIP (handleDownloadZipPerPart di bawah) — kalau tidak, nomor
  // "fasad1.webp"/"fasad2.webp" bisa berbeda antara yang disebut di prompt dan isi
  // ZIP (invarian paling penting Tahap 4, lihat buildZipNames() di options.ts).
  const zipImages: ZipSourceImage[] = useMemo(
    () => (prop ? prop.images.filter(im => im.label_ruangan?.trim()).map(im => ({ id: im.id, label_ruangan: im.label_ruangan })) : []),
    [prop],
  );
  const compileSrc = useMemo(() => ({ s1, s3 }), [s1, s3]);
  const debouncedSrc = useDebouncedValue(compileSrc, 300);
  const masterPrompt = useMemo(
    () => (prop && onStep4 ? compileMasterPrompt(prop, debouncedSrc.s1, debouncedSrc.s3, zipImages) : ''),
    [prop, onStep4, debouncedSrc, zipImages],
  );

  // Style Pair A/B — varian kedua dengan arketipe berbeda untuk uji split.
  // '' = nonaktif. Varian B mewarisi semua parameter, hanya arketipe + gaya
  // visual/tone/karakter di-override sesuai default arketipe B.
  const [abVariant, setAbVariant] = useState('');
  const [copiedB, setCopiedB] = useState(false);
  const masterPromptB = useMemo(() => {
    if (!prop || !abVariant || !onStep4) return '';
    const arcB = findArchetype(abVariant);
    if (!arcB) return '';
    const { s1: ds1, s3: ds3 } = debouncedSrc;
    // cutawayExcluded ikut aturan applyArchetype: B hybrid mewarisi pilihan A bila
    // A juga hybrid; kalau tidak, pakai default hybrid (Part terakhir dikecualikan).
    const aIsHybrid = findArchetype(ds1.archetype)?.allowMultiShotPerScene === true;
    const cutawayB = arcB.allowMultiShotPerScene ? (aIsHybrid ? ds1.cutawayExcluded : [ds1.parts.length]) : [];
    const s1B: Step1State = { ...ds1, archetype: abVariant, visualStyle: arcB.defaults.visualStyle, tone: arcB.defaults.tone, cutawayExcluded: cutawayB };
    const s3B: Step3State = { ...ds3, useCharacter: arcB.defaults.useCharacter, expression: arcB.defaults.expression };
    return compileMasterPrompt(prop, s1B, s3B, zipImages);
  }, [prop, abVariant, onStep4, debouncedSrc, zipImages]);

  // Simpan riwayat otomatis saat Step 4 tampil; record baru bila prompt berubah.
  useEffect(() => {
    if (step !== 5 || !prop || !masterPrompt) return;
    if (savedPromptRef.current === masterPrompt) return;
    savedPromptRef.current = masterPrompt;
    setGenerationId(null);
    setSaving(true);
    fetch('/api/admin/viralframe/generations', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        property_id: prop.id,
        // rulebook_version (Stage 3) — stempel aditif, tidak dibaca applyConfig(),
        // murni untuk traceability: generate lama bisa dibandingkan ke aturan yang
        // berlaku saat itu dibuat kalau REALISM_*/dsb berubah lagi di masa depan.
        params_json: JSON.stringify({ s1, s3, rulebook_version: RULEBOOK_VERSION }),
        master_prompt: masterPrompt,
      }),
    })
      .then(r => bacaJson(r))
      .then(j => { if (j?.data?.id) setGenerationId(j.data.id); })
      .catch(() => {})
      .finally(() => setSaving(false));
    // s1/s3 sengaja tidak di deps — perubahannya tercermin via masterPrompt
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, masterPrompt, prop]);

  // Copy Prompt Natural — renderer KEDUA dari data yang sama persis dengan masterPrompt
  // (Part/Karakter/Parameter), berupa paragraf naratif per Part untuk paste manual ke
  // tool percakapan (Google Flow/Veo) — pelengkap "Copy Prompt JSON" (masterPrompt di atas).
  const naturalPrompt = useMemo(
    () => (prop && onStep4 ? compileNaturalPrompt(prop, debouncedSrc.s1, debouncedSrc.s3, zipImages) : ''),
    [prop, onStep4, debouncedSrc, zipImages],
  );
  const [copiedNatural, setCopiedNatural] = useState(false);
  const handleCopyNatural = async () => {
    try {
      await navigator.clipboard.writeText(naturalPrompt);
      setCopiedNatural(true);
      setTimeout(() => setCopiedNatural(false), 2000);
    } catch { /* clipboard tidak tersedia */ }
  };

  // Thumbnail composite (Cloudinary fetch delivery) — bukan AI image-gen, lihat
  // functions/api/admin/viralframe/thumbnail.js untuk alasannya.
  interface ThumbData { thumbnail_url: string; harga_turun: boolean; harga_text: string; spec_text: string; has_character: boolean }
  const [thumbData, setThumbData] = useState<ThumbData | null>(null);
  const [thumbLoading, setThumbLoading] = useState(false);
  const [thumbError, setThumbError] = useState('');
  const [copiedThumb, setCopiedThumb] = useState(false);
  const loadThumbnail = async () => {
    if (!prop) return;
    setThumbLoading(true); setThumbError(''); setThumbData(null);
    try {
      const qs = new URLSearchParams({ property_id: String(prop.id) });
      if (s3.useCharacter && s3.characterId != null) qs.set('character_id', String(s3.characterId));
      const res = await fetch(`/api/admin/viralframe/thumbnail?${qs.toString()}`, { credentials: 'include' });
      const json = await bacaJson(res);
      if (!json.success) throw new Error(json.error ?? 'Gagal membangun thumbnail');
      setThumbData(json.data);
    } catch (err) {
      setThumbError(err instanceof Error ? err.message : 'Gagal membangun thumbnail');
    } finally {
      setThumbLoading(false);
    }
  };
  // Prompt VISUAL-SAJA untuk thumbnail (Tahap 4, poin 6) — TIDAK menyentuh pipeline
  // composite Cloudinary di thumbnail.js (tetap dipakai untuk menempel judul/harga,
  // keputusan lama yang benar: model image-gen buruk merender teks legible). Ini
  // hanya teks bantu opsional bila user ingin variasi latar via AI image-gen lain,
  // dibangun lokal di sini (bukan dari masterPromptCompiler.ts — di luar kepemilikan).
  const thumbnailVisualPrompt = useMemo(() => {
    if (!prop) return '';
    const arc = findArchetype(s1.archetype);
    const styleLabel = VISUAL_STYLES.find(v => v.value === s1.visualStyle)?.label ?? s1.visualStyle;
    const moodParts = [arc ? arc.label : styleLabel, 'natural daylight, realistic photography, shallow depth of field'];
    const subjek = s3.useCharacter && s3.character
      ? `${buildCharacterDescription(s3.character, s3.expression)} standing near the property facade`
      : 'property facade as the main subject, no visible people';
    return [
      `Real estate thumbnail background, ${prop.jenis_properti} facade, ${prop.kecamatan}, ${prop.kabupaten}.`,
      `Subject: ${subjek}.`,
      `Mood/style: ${moodParts.join(', ')}.`,
      'Composition: leave empty negative space in upper third for text overlay (added separately, NOT part of this image).',
      'IMPORTANT: no text, no letters, no numbers, no logos, no watermark rendered in the image — visual only.',
    ].join('\n');
  }, [prop, s1.archetype, s1.visualStyle, s3.useCharacter, s3.character, s3.expression]);
  const [copiedThumbPrompt, setCopiedThumbPrompt] = useState(false);
  const handleCopyThumbPrompt = async () => {
    try {
      await navigator.clipboard.writeText(thumbnailVisualPrompt);
      setCopiedThumbPrompt(true);
      setTimeout(() => setCopiedThumbPrompt(false), 2000);
    } catch { /* clipboard tidak tersedia */ }
  };
  const handleCopyThumbUrl = async () => {
    if (!thumbData) return;
    try {
      await navigator.clipboard.writeText(thumbData.thumbnail_url);
      setCopiedThumb(true);
      setTimeout(() => setCopiedThumb(false), 2000);
    } catch { /* clipboard tidak tersedia */ }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(masterPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard tidak tersedia */ }
  };

  const handleCopyB = async () => {
    try {
      await navigator.clipboard.writeText(masterPromptB);
      setCopiedB(true);
      setTimeout(() => setCopiedB(false), 2000);
    } catch { /* clipboard tidak tersedia */ }
  };

  const handleDownload = () => {
    const blob = new Blob([masterPrompt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `viralframe-${prop?.kode_listing ?? id}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ─── Catatan Produksi (Σ VO vs Σ durasi Part, Tahap 3 Agent 3) ────────────
  const productionNotes = useMemo(() => buildProductionNotes(s1.parts), [s1.parts]);
  const totalDurationSec = useMemo(() => totalDurationOfParts(s1.parts), [s1.parts]);

  // Reset hasil validasi bila PARAMETER (s1/s3) benar-benar berubah agar tidak
  // stale — sengaja pakai `debouncedSrc`, BUKAN `masterPrompt`. `masterPrompt`
  // sengaja di-set '' setiap kali step !== 5 (optimasi performa, lihat komentar di
  // deklarasinya), jadi dulu dependency ini membuat navigasi Step 5→4→5 TANPA
  // edit apa pun ikut menghapus JSON yang sudah dipaste+divalidasi + Part Cards
  // (audit 2026-07-28). `debouncedSrc` hanya berubah referensi kalau s1/s3
  // benar-benar berubah, tidak terpengaruh navigasi step.
  useEffect(() => {
    setValResult(null); setValidData(null); setWarningsDismissed(false); setZipError('');
  }, [debouncedSrc]);

  const handleValidate = () => {
    setZipError('');
    const result = validatePartJson(pasteRaw, { parts: s1.parts, aiTool: s1.aiTool });
    setValResult(result);
    setWarningsDismissed(false);
    if (result.ok && result.data) {
      setValidData(result.data);
      // Simpan hasil JSON tervalidasi ke riwayat (non-blocking).
      if (generationId) {
        fetch(`/api/admin/viralframe/generations/${generationId}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ result_json: JSON.stringify(result.data) }),
        }).catch(() => {});
      }
    } else {
      setValidData(null);
    }
  };

  // ─── Nama file referensi per Part (lokal, sinkron ZIP ↔ Prompt) ────────────
  // Logika IDENTIK dengan `partRefImageNames()` privat di masterPromptCompiler.ts
  // (karakter dulu bila dipakai, lalu refPhotoIds Part via nameMap) — dipertahankan
  // terpisah di sini (bukan diimpor, fungsi itu tidak diekspor) supaya ZIP builder
  // tidak bergantung pada internal compiler, tapi berbasis SUMBER data yang sama
  // (buildZipNames(zipImages) dari options.ts) sehingga hasilnya WAJIB identik.
  function partRefFileNamesLocal(p: PartDef, nameMap: Map<number, string>): string[] {
    const names: string[] = [];
    if (s3.useCharacter && s3.character) names.push(characterFileName(s3.character.nama));
    for (const pid of p.refPhotoIds) {
      const label = p.cuts.find(c => c.photoId === pid)?.label ?? '';
      const nm = nameMap.get(pid) ?? `${slugifyLabel(label)}.webp`;
      if (!names.includes(nm)) names.push(nm);
    }
    return names;
  }

  // Potong naturalPrompt (yang SAMA PERSIS dipakai tombol "Copy Prompt Natural")
  // jadi per-Part berdasarkan header "## PART {n} —" yang selalu ditulis
  // compileNaturalPrompt() — dipakai isi PROMPT.txt per folder ZIP, supaya teksnya
  // IDENTIK dengan yang tampil di layar (bukan dirakit ulang dari data mentah).
  function splitNaturalPromptByPart(natural: string, totalParts: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < totalParts; i++) {
      const start = natural.indexOf(`## PART ${i + 1} —`);
      if (start === -1) { out.push(''); continue; }
      const nextMarker = i + 1 < totalParts ? `## PART ${i + 2} —` : '## CATATAN PRODUKSI';
      const end = natural.indexOf(nextMarker, start);
      out.push(natural.slice(start, end === -1 ? undefined : end).trim());
    }
    return out;
  }

  // ─── ZIP PER-PART (Tahap 4, utama) — dari Master Prompt/Parameter aktif ────
  // Struktur: part{N}_{label}/PROMPT.txt + part{N}_{label}/LAMPIRKAN/{foto}.webp,
  // README.txt. Nama file di LAMPIRKAN/ WAJIB identik dengan yang disebut di
  // PROMPT.txt — keduanya dibangun dari `zipImages` + `buildZipNames()` yang SAMA,
  // itulah yang menjamin invariannya (lihat validasi di laporan akhir agent).
  //
  // ⚠️ ADA DUA PEMBANGUN ZIP DI FILE INI, dan keduanya WAJIB sepakat soal penamaan:
  //   1. `handleDownloadZip()`      — jalur HASIL AI (`generatedResult`). Nama foto
  //      diambil dari `part.cuts[].photo`, yang di-backend (`ai-generate.js`)
  //      dibangun ulang dari `assignment.cuts[].foto_file` — juga asal buildZipNames().
  //   2. `handleDownloadZipPerPart()` (di bawah) — jalur MASTER PROMPT. Memanggil
  //      buildZipNames() langsung.
  // Keduanya bermuara ke buildZipNames() sehingga saat ini konsisten. Sengaja TIDAK
  // digabung: merger di file sebesar ini lebih berisiko daripada duplikasinya. Kalau
  // salah satu diubah, ubah yang lain juga — kalau tidak, user melampirkan foto yang
  // keliru ke Google Flow dan tidak ada gate build yang akan menangkapnya.
  const [zipPerPartBusy, setZipPerPartBusy] = useState(false);
  const [zipPerPartError, setZipPerPartError] = useState('');
  const handleDownloadZipPerPart = async () => {
    if (!prop) return;
    setZipPerPartBusy(true); setZipPerPartError('');
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const nameMap = buildZipNames(zipImages);
      const parts = s1.parts;
      const sections = splitNaturalPromptByPart(naturalPrompt, parts.length);

      for (let pi = 0; pi < parts.length; pi++) {
        const p = parts[pi];
        const folder = `part${pi + 1}_${slugifyLabel(p.label || p.role)}`;
        zip.file(`${folder}/PROMPT.txt`, sections[pi] || '(Master Prompt belum terkompilasi — buka tab Master Prompt dulu)');
        const lampirkan = zip.folder(`${folder}/LAMPIRKAN`);
        const fileNames = partRefFileNamesLocal(p, nameMap);
        for (const fname of fileNames) {
          if (s3.useCharacter && s3.character && fname === characterFileName(s3.character.nama)) {
            if (s3.character.foto_url) {
              const res = await fetch(`/api/admin/media?key=${encodeURIComponent(s3.character.foto_url)}`, { credentials: 'include' });
              if (res.ok) lampirkan?.file(fname, await res.blob());
            }
            continue;
          }
          const photoId = [...nameMap.entries()].find(([, n]) => n === fname)?.[0];
          const img = photoId != null ? prop.images.find(im => im.id === photoId) : null;
          if (!img) continue;
          const res = await fetch(`/api/admin/media?key=${encodeURIComponent(img.url_webp)}`, { credentials: 'include' });
          if (res.ok) lampirkan?.file(fname, await res.blob());
        }
      }

      zip.file(
        'README.txt',
        `ZIP per-Part — ${prop.kode_listing}\n\n` +
        `Tiap folder "part{N}_{label}" berisi:\n` +
        `- PROMPT.txt   : teks siap-tempel untuk Part itu (1 Part = 1 generate call di Google Flow/Veo/dst).\n` +
        `- LAMPIRKAN/   : foto referensi yang DISEBUT di PROMPT.txt — nama file IDENTIK, lampirkan semuanya\n` +
        `                 sebagai reference image sebelum menekan generate.\n\n` +
        `Total ${parts.length} Part, total durasi ${totalDurationSec} detik.\n`,
      );

      const out = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(prop.kode_listing ?? 'SBP').replace(/[^a-zA-Z0-9-]/g, '-')}-per-part.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setZipPerPartError(err instanceof Error ? err.message : 'Gagal membuat ZIP per-Part');
    } finally {
      setZipPerPartBusy(false);
    }
  };

  // ─── ZIP dari tab "Paste & Validate" — dari JSON hasil AI eksternal ────────
  // reference_images[] di JSON AI sudah berisi nama file (disalin dari daftar
  // "LAMPIRKAN SEBAGAI REFERENCE IMAGE" BLOK 3b) — reverseMap menemukan foto
  // sumbernya lewat nameMap yang SAMA, sehingga tetap sinkron dengan buildZipNames().
  const handleDownloadZip = async () => {
    if (!validData || !prop) return;
    setZipBusy(true); setZipError('');
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const nameMap = buildZipNames(zipImages);
      const reverseMap = new Map<string, number>();
      for (const [pid, name] of nameMap) reverseMap.set(name, pid);
      const characterFname = s3.useCharacter && s3.character ? characterFileName(s3.character.nama) : null;

      const parts = validData.parts ?? [];
      for (let pi = 0; pi < parts.length; pi++) {
        const p = parts[pi];
        const folder = `part${pi + 1}_${slugifyLabel(p.role || `part${pi + 1}`)}`;
        zip.file(`${folder}/PROMPT.txt`, partPromptText(p));
        const lampirkan = zip.folder(`${folder}/LAMPIRKAN`);
        for (const fname of (p.reference_images ?? [])) {
          if (characterFname && fname === characterFname) {
            if (s3.character?.foto_url) {
              const res = await fetch(`/api/admin/media?key=${encodeURIComponent(s3.character.foto_url)}`, { credentials: 'include' });
              if (res.ok) lampirkan?.file(fname, await res.blob());
            }
            continue;
          }
          const photoId = reverseMap.get(fname);
          const img = photoId != null ? prop.images.find(im => im.id === photoId) : null;
          if (!img) continue;
          const res = await fetch(`/api/admin/media?key=${encodeURIComponent(img.url_webp)}`, { credentials: 'include' });
          if (res.ok) lampirkan?.file(fname, await res.blob());
        }
      }

      // caption_hashtag.txt
      const pn = validData.production_notes ?? {};
      const caption = pn.caption ?? '';
      const hashtags = Array.isArray(pn.hashtags)
        ? pn.hashtags.map(h => `#${String(h).replace(/^#/, '')}`).join(' ')
        : '';
      zip.file('caption_hashtag.txt', `CAPTION:\n${caption}\n\nHASHTAGS:\n${hashtags}`);

      // subtitles.srt — timing dari dialog + duration_sec tiap Part
      const srt = buildSrtFromParts(parts);
      if (srt.trim()) zip.file('subtitles.srt', srt);

      // parts.json — JSON hasil AI tervalidasi apa adanya, agar bundle mandiri.
      zip.file('parts.json', JSON.stringify(validData, null, 2));

      const out = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(prop.kode_listing ?? 'SBP').replace(/[^a-zA-Z0-9-]/g, '-')}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setZipError(err instanceof Error ? err.message : 'Gagal membuat ZIP');
    } finally {
      setZipBusy(false);
    }
  };

  // ─── Render states ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="py-16 text-center text-[#94A3B8] text-sm">
        <div className="w-6 h-6 border-2 border-[#1565C0]/20 border-t-[#1565C0] rounded-full animate-spin mx-auto mb-2" />
        Memuat properti…
      </div>
    );
  }
  if (error || !prop) {
    return (
      <div className="py-16 text-center">
        <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
        <p className="text-[#64748B] text-sm mb-4">{error || 'Properti tidak ditemukan'}</p>
        <button onClick={() => navigate('/admin/viralframe')}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-[#1565C0] border border-[#1565C0]/30 hover:bg-[#F0F7FF]">
          ← Kembali
        </button>
      </div>
    );
  }

  const cover = prop.images.find(im => im.is_cover) ?? prop.images[0];
  const coverUrl = mediaSrc(cover?.url_webp ?? null);
  const activeErrors = errorsFor(step);

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Header properti ringkas */}
      <button onClick={() => navigate('/admin/viralframe')}
        className="flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#1565C0] transition-colors">
        <ArrowLeft size={15} /> Daftar properti
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
        <div className="w-16 h-16 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0">
          {coverUrl ? (
            <img src={coverUrl} alt={prop.title} className="w-full h-full object-cover" loading="lazy" decoding="async"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><ImageOff size={20} className="text-gray-300" /></div>
          )}
        </div>
        <div className="min-w-0">
          <div className="font-display font-bold text-[#0F172A] text-base leading-snug line-clamp-2">{prop.title}</div>
          <div className="text-xs text-[#64748B] mt-0.5">
            {prop.kode_listing} · {prop.jenis_properti} · {prop.kecamatan}, {prop.kabupaten}
          </div>
        </div>
        <div className="ml-auto hidden sm:flex items-center gap-1.5 text-[#1565C0]">
          <Film size={16} /> <span className="text-xs font-semibold">ViralFrame</span>
        </div>
      </div>

      {/* Tahap 4: YouTube Long 1-klik menggantikan wizard.
          Tombol kembali WAJIB ada di sini: sejak wizard jadi accordion, tombol
          navigasi hidup di dalam tiap section — dan section-section itu tidak
          ter-render di mode ini, jadi tanpa tombol ini user terjebak. */}
      {isYoutubeLongMode && prop && (
        <>
          <button onClick={() => setStep(2)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-[#64748B] border border-gray-200 bg-white hover:bg-gray-50 transition-colors">
            <ArrowLeft size={15} /> Kembali ke pilihan Mode
          </button>
          <YouTubeLongViewMemo propertyId={prop.id} propertyTitle={prop.title} photos={prop.images} />
        </>
      )}

      {!isYoutubeLongMode && (<>
      {/* Tahap 1: Banner draft tersimpan */}
      {draftFound && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-amber-800">
            📝 Draft tersimpan ditemukan{draftFound.ts ? ` (${new Date(draftFound.ts).toLocaleString('id-ID')})` : ''}. Lanjutkan?
          </span>
          <div className="flex gap-2">
            <button onClick={restoreDraft} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#1565C0] hover:bg-[#1565C0]/90">Pulihkan</button>
            <button onClick={dismissDraft} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-700 border border-amber-300 hover:bg-amber-100">Mulai baru</button>
          </div>
        </div>
      )}

      {/* Tahap 1: Riwayat generate */}
      {history.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
            <button onClick={() => setShowHistory(v => !v)}
              className="flex-1 flex items-center justify-between text-left">
              <span className="text-sm font-semibold text-[#0F172A] flex items-center gap-2">
                <History size={15} className="text-[#1565C0]" /> Riwayat ({history.length})
              </span>
              <span className="text-[#94A3B8] text-xs">{showHistory ? '▲' : '▼'}</span>
            </button>
            {showHistory && (
              <button onClick={clearHistory} disabled={deletingHistoryId === 'all'}
                className="ml-3 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 flex-shrink-0">
                {deletingHistoryId === 'all' ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Hapus semua
              </button>
            )}
          </div>
          {showHistory && (
            <div className="border-t border-gray-100 divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {history.map(h => {
                const hasResult = !!h.result_json;
                return (
                  <div key={h.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[#0F172A]">#{h.id} · {new Date(h.created_at).toLocaleString('id-ID')}</div>
                      <div className="text-[11px] text-[#94A3B8]">{hasResult ? '✅ ada hasil JSON' : '📝 konfigurasi'}</div>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      {h.params_json && (
                        <button onClick={() => { try { applyConfig(JSON.parse(h.params_json!)); setStep(0); setShowHistory(false); } catch { /* ignore */ } }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#1565C0] border border-[#1565C0]/30 hover:bg-[#F0F7FF]">Muat konfigurasi</button>
                      )}
                      {hasResult && (
                        <button onClick={() => { try { setValidData(JSON.parse(h.result_json!)); setStep(4); setStep4Tab('validate'); setShowHistory(false); } catch { /* ignore */ } }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-emerald-700 border border-emerald-200 hover:bg-emerald-50">Lihat hasil</button>
                      )}
                      <button onClick={() => deleteHistoryItem(h.id)} disabled={deletingHistoryId === h.id}
                        title={`Hapus riwayat #${h.id}`}
                        className="px-2 py-1 rounded-lg text-red-500 border border-red-200 hover:bg-red-50 disabled:opacity-50">
                        {deletingHistoryId === h.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bar indikator — ringkasan progres + pintasan membuka section mana pun */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <StepIndicator current={step} done={sectionDone} onJump={toggleSection} />
      </div>

      {/* Daftar error */}
      {showErrors && activeErrors.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-red-700 font-semibold text-sm mb-1.5">
            <AlertCircle size={15} /> Lengkapi dulu:
          </div>
          <ul className="list-disc list-inside text-sm text-red-600 space-y-0.5">
            {activeErrors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}


      {/* ─── SECTION 0 — Label Foto ───
          Reorder Tahap 4 (2026-08-01): Section ini kembali MURNI Label Foto +
          centang bahan. Part designer & tombol "AI Rancang Storyboard" pindah ke
          Section 3 (Parameter Video) — di titik itu karakter (Section 1) & mode
          (Section 2) sudah terisi, jadi payload ke suggest-storyboard.js lengkap
          (character_photo_url, ai_tool tersedia). Lihat Section 3 di bawah. */}
      {prop && (
        <Section
          n={0} title={SECTION_TITLES[0]}
          open={step === 0} done={sectionDone(0)}
          onToggle={() => toggleSection(0)}
          footer={
            <div className="flex justify-end pt-1">
              <button onClick={goNext}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: ACCENT }}>
                Lanjut <ArrowRight size={15} />
              </button>
            </div>
          }>
          <LabelFotoStep
            images={prop.images}
            kodeListing={prop.kode_listing}
            onSaveLabel={savePhotoLabel}
            selectedIds={selectedForVideo}
            onToggleSelected={toggleSelectedForVideo}
          />
        </Section>
      )}

      {/* ─── SECTION 1 — Pilih Karakter ─── */}
      <Section
        n={1} title={SECTION_TITLES[1]}
        open={step === 1} done={sectionDone(1)}
        onToggle={() => toggleSection(1)}
        footer={<SectionNav onBack={goBack} onNext={goNext} />}>
        <CharacterStep value={s3} onChange={update3} />
      </Section>

      {/* ─── SECTION 2 — Pilih Mode ─── */}
      <Section
        n={2} title={SECTION_TITLES[2]}
        open={step === 2} done={sectionDone(2)}
        onToggle={() => toggleSection(2)}
        footer={<SectionNav onBack={goBack} onNext={goNext} />}>
        <div className="space-y-4">
          <p className="text-sm text-[#64748B]">Pilih jalur generate yang mau dipakai untuk video ini.</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <button type="button" onClick={() => setMode('ai-generate')}
              className={`text-left p-4 rounded-2xl border-2 transition-all ${mode === 'ai-generate' ? 'border-[#1565C0] bg-[#F0F7FF]' : 'border-gray-100 hover:border-gray-200'}`}>
              <div className="text-sm font-bold text-[#0F172A] flex items-center gap-1.5">⚡ AI Generate <span className="text-[10px] font-semibold text-white bg-[#1565C0] rounded-full px-1.5 py-0.5">REKOMENDASI</span></div>
              <p className="text-xs text-[#64748B] mt-1">AI menyusun prompt & narasi otomatis dari parameter yang kamu pilih.</p>
            </button>
            <button type="button" onClick={() => setMode('manual')}
              className={`text-left p-4 rounded-2xl border-2 transition-all ${mode === 'manual' ? 'border-[#1565C0] bg-[#F0F7FF]' : 'border-gray-100 hover:border-gray-200'}`}>
              <div className="text-sm font-bold text-[#0F172A]">Manual (4 Step)</div>
              <p className="text-xs text-[#64748B] mt-1">Kamu susun & tulis sendiri Master Prompt-nya, AI hanya bantu compile.</p>
            </button>
            <button type="button" onClick={() => setMode('youtube-long')}
              className={`text-left p-4 rounded-2xl border-2 transition-all ${mode === 'youtube-long' ? 'border-red-500 bg-red-50' : 'border-gray-100 hover:border-gray-200'}`}>
              <div className="text-sm font-bold text-[#0F172A]">📺 YouTube Long (16:9)</div>
              <p className="text-xs text-[#64748B] mt-1">Alur 1-klik terpisah untuk video landscape berdurasi panjang.</p>
            </button>
          </div>
        </div>
      </Section>

      {/* ─── SECTION 3 — Parameter Video ─── */}
      <Section
        n={3} title={SECTION_TITLES[3]}
        open={step === 3} done={sectionDone(3)}
        onToggle={() => toggleSection(3)}
        footer={<SectionNav onBack={goBack} onNext={goNext} />}>
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-display font-bold text-[#0F172A]">Step 4 — Parameter Video</h2>
            {/* R11: Preset tim */}
            <div className="flex items-center gap-2">
              {presets.length > 0 && (
                <select onChange={e => { if (e.target.value) { applyPreset(e.target.value); e.target.value = ''; } }} defaultValue=""
                  className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-[#1565C0]">
                  <option value="">📋 Muat preset…</option>
                  {presets.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                </select>
              )}
              <button onClick={savePreset} className="text-xs font-semibold text-[#1565C0] border border-[#1565C0]/30 rounded-lg px-2 py-1.5 hover:bg-[#F0F7FF]">💾 Simpan preset</button>
              <button type="button" onClick={pilihPresetSelanjutnya}
                title="Pilih archetype berbeda dari generate sebelumnya untuk properti ini — biar hasil videonya bervariasi, tidak dianggap spam."
                className="text-xs font-semibold text-white rounded-lg px-2 py-1.5 hover:opacity-90" style={{ background: '#7C3AED' }}>
                🔄 Preset Selanjutnya
              </button>
            </div>
          </div>

          {/* (0) Arketipe / Gaya Video — prefill parameter granular secara koheren */}
          <Field label="Gaya Video (Arketipe)" hint="Pilih satu gaya → Gaya Visual, Tone, & koreografi kamera terisi otomatis (tetap bisa diubah). Pilih Kustom untuk atur manual.">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ARCHETYPES.map(a => {
                const active = s1.archetype === a.id;
                const dipakai = pemakaianArketipe.get(a.id) ?? 0;
                return (
                  <button key={a.id} type="button" onClick={() => applyArchetype(a.id)}
                    className={`text-left p-3 rounded-xl border transition-colors relative ${
                      active ? 'bg-[#EFF6FF] border-[#1565C0] ring-1 ring-[#1565C0]/30' : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}>
                    {/* Badge informatif — tidak menonaktifkan tombol. Gaya yang sering
                        dipakai membuat video terasa seragam; user tetap yang memutuskan. */}
                    {dipakai > 0 && (
                      <span
                        title={`Arketipe ini dipakai ${dipakai}x dari ${RIWAYAT_ARKETIPE_N} generate terakhir properti ini. Memilih gaya berbeda membuat video tidak terasa seragam — tapi ini saran, bukan larangan.`}
                        className={`absolute top-2 right-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          dipakai >= 2 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-[#64748B]'
                        }`}>
                        {dipakai}x
                      </span>
                    )}
                    <div className="text-lg leading-none mb-1">{a.emoji}</div>
                    <div className={`text-sm font-semibold pr-7 ${active ? 'text-[#1565C0]' : 'text-[#0F172A]'}`}>{a.label}</div>
                    <div className="text-[11px] text-[#64748B] leading-snug mt-0.5">{a.ringkas}</div>
                  </button>
                );
              })}
              {(() => {
                const active = s1.archetype === ARCHETYPE_CUSTOM_ID;
                return (
                  <button type="button" onClick={() => applyArchetype(ARCHETYPE_CUSTOM_ID)}
                    className={`text-left p-3 rounded-xl border transition-colors ${
                      active ? 'bg-[#EFF6FF] border-[#1565C0] ring-1 ring-[#1565C0]/30' : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}>
                    <div className="text-lg leading-none mb-1">🎛️</div>
                    <div className={`text-sm font-semibold ${active ? 'text-[#1565C0]' : 'text-[#0F172A]'}`}>Kustom</div>
                    <div className="text-[11px] text-[#64748B] leading-snug mt-0.5">Atur semua parameter manual tanpa preset.</div>
                  </button>
                );
              })()}
            </div>
          </Field>

          {/* Per-Part cutaway override — hanya muncul untuk arketipe hybrid
              (agent_broll_hybrid/selfie_luxury_hybrid). Default: Part terakhir
              (CTA) dikecualikan dari cutaway (talking-head/selfie murni sebagai
              penutup); user bisa toggle Part mana pun secara manual. */}
          {(() => {
            const arc = findArchetype(s1.archetype);
            if (!arc?.allowMultiShotPerScene) return null;
            return (
              <Field label="Per-Part: Cutaway B-Roll" hint='Nonaktifkan cutaway di Part tertentu (mis. CTA/penutup) — Part itu jadi talking-head/selfie murni tanpa disela b-roll.'>
                <div className="space-y-1.5">
                  {s1.parts.map((p, idx) => {
                    const partNum = idx + 1;
                    const excluded = s1.cutawayExcluded.includes(partNum);
                    return (
                      <div key={partNum} className="flex items-center justify-between px-3 py-2 border border-gray-100 rounded-xl">
                        <span className="text-sm text-[#0F172A]">Part {partNum} <span className="text-xs text-[#94A3B8]">({p.role})</span></span>
                        <button type="button" onClick={() => toggleCutawayExcluded(partNum)}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                            excluded ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-[#EFF6FF] border-[#1565C0]/30 text-[#1565C0]'
                          }`}>
                          {excluded ? 'Talking-Head Saja' : 'Cutaway Aktif'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </Field>
            );
          })()}

          {/* ── Rancang Part (model Part-as-Generate-Unit) — PINDAH ke sini dari
              Section 0 (Tahap 4 reorder): di titik ini karakter (Section 1) & mode
              (Section 2) sudah terisi, jadi payload ke suggest-storyboard.js bisa
              berisi character_photo_url + ai_tool. 1 Part = 1 panggilan generate;
              AI ("AI Rancang Storyboard") menentukan cuts/foto referensi/rationale
              tiap Part — role/durasi/durasi VO TETAP dikunci user di sini. */}
          <Field label="Rancang Part" hint={`Tentukan jumlah Part, durasi (≤${clipMaxForTool}s untuk ${AI_TOOLS.find(t => t.value === s1.aiTool)?.label ?? s1.aiTool}), dan durasi VO tiap Part. Cuts & foto referensi diisi AI di bagian "Sutradara AI" paling bawah, setelah seluruh parameter di halaman ini terisi.`}>
            <div className="space-y-2">
              {s1.parts.map((p, idx) => {
                return (
                  <div key={idx} className="px-3 py-2 border border-gray-100 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-[#94A3B8] w-14 shrink-0">Part {idx + 1}</span>
                      <select value={p.role} onChange={e => updatePart(idx, { role: e.target.value as PartDef['role'] })}
                        className="text-sm border border-gray-200 rounded-lg px-2 py-1">
                        <option value="Hook">Hook</option>
                        <option value="Body">Body</option>
                        <option value="CTA">CTA</option>
                      </select>
                      <input type="number" min={1} max={clipMaxForTool} value={p.durationSec}
                        onChange={e => {
                          const d = Math.max(1, Math.min(clipMaxForTool, parseInt(e.target.value, 10) || 1));
                          updatePart(idx, { durationSec: d, voDurationSec: Math.min(p.voDurationSec, d) });
                        }}
                        className="w-16 text-sm border border-gray-200 rounded-lg px-2 py-1" title={`Durasi Part, maks ${clipMaxForTool} detik`} />
                      <span className="text-xs text-[#94A3B8] shrink-0">detik</span>
                      <input type="number" min={0} max={p.durationSec} value={p.voDurationSec}
                        onChange={e => updatePart(idx, { voDurationSec: Math.max(0, Math.min(p.durationSec, parseInt(e.target.value, 10) || 0)) })}
                        className="w-16 text-sm border border-gray-200 rounded-lg px-2 py-1" title="Durasi VO (detik)" />
                      <span className="text-xs text-[#94A3B8] shrink-0">detik VO</span>
                      <input type="text" value={p.label ?? ''} placeholder="Label (opsional)"
                        onChange={e => updatePart(idx, { label: e.target.value })}
                        className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1 min-w-[120px]" />
                      <button type="button" onClick={() => removePart(idx)}
                        className="text-xs text-red-500 hover:text-red-700 shrink-0">Hapus</button>
                    </div>
                    {s1.parts.length === 1 && (
                      <p className="text-[11px] text-[#94A3B8]">
                        Part tunggal ini otomatis diperlakukan sebagai Hook + Body + CTA sekaligus dalam satu klip —
                        energi & ajakan penutup tetap disisipkan AI di cuts terakhir, walau label di atas cuma "Hook".
                      </p>
                    )}
                  </div>
                );
              })}
              <button type="button" onClick={addPart}
                className="text-xs font-semibold text-[#1565C0] hover:text-[#0F4C9E]">+ Tambah Part</button>
            </div>
          </Field>

          {/* Catatan Produksi (Tahap 3 Agent 3) — Σ VO vs Σ durasi, sisa waktu, peringatan over-VO */}
          <div className={`flex gap-2 rounded-xl border px-3 py-2.5 text-sm ${productionNotes.overVoWarning ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-[#1565C0]/20 bg-[#F0F7FF] text-[#0F172A]'}`}>
            <span aria-hidden="true">{productionNotes.overVoWarning ? '⚠️' : 'ℹ️'}</span>
            <p>
              <strong>Catatan Produksi:</strong> {productionNotes.summaryText}
              {' '}Total <strong>{totalDurationSec} detik</strong> dari {s1.parts.length} Part.
            </p>
          </div>

          {/* (c) Platform */}
          <Field label="Platform Distribusi" hint="Centang pertama = platform primer">
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map(p => {
                const idx = s1.platforms.indexOf(p.value);
                const checked = idx !== -1;
                const primer = idx === 0;
                return (
                  <button key={p.value} type="button" onClick={() => togglePlatform(p.value)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      checked ? 'bg-[#EFF6FF] border-[#1565C0]/40 text-[#1565C0]' : 'bg-white border-gray-200 text-[#64748B] hover:bg-gray-50'
                    }`}>
                    <span className={`w-4 h-4 rounded border flex items-center justify-center ${checked ? 'bg-[#1565C0] border-[#1565C0]' : 'border-gray-300'}`}>
                      {checked && <Check size={11} className="text-white" />}
                    </span>
                    {p.label}
                    {primer && <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#1565C0] text-white">PRIMER</span>}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* (d) AI Tool */}
            <Field label="AI Video Tool"
              hint={`Batas prompt ±${AI_TOOLS.find(t => t.value === s1.aiTool)?.charLimit ?? 1000} karakter`}>
              <Select value={s1.aiTool} onChange={gantiAiTool} opts={AI_TOOLS} />
            </Field>
            {/* (e) Rasio */}
            <Field label="Rasio Video">
              <Select value={s1.ratio} onChange={v => update1('ratio', v)} opts={RATIOS} />
            </Field>
            {/* (f) Bahasa */}
            <Field label="Bahasa Narasi">
              <Select value={s1.language} onChange={v => update1('language', v)} opts={LANGUAGES} />
            </Field>
            {/* (g) Hook */}
            <Field label="Tipe Hook (Scene 1)">
              <Select value={s1.hookType} onChange={v => update1('hookType', v)} opts={HOOK_TYPES} />
            </Field>
            {/* (i) Visual */}
            <Field label="Gaya Visual">
              <Select value={s1.visualStyle} onChange={v => update1('visualStyle', v)} opts={VISUAL_STYLES} />
            </Field>
            {/* (j) Tone */}
            <Field label="Tone Narasi">
              <Select value={s1.tone} onChange={v => update1('tone', v)} opts={TONES} />
            </Field>
            {/* Gaya Bahasa (register) — memengaruhi dialog/narasi */}
            <Field label="Gaya Bahasa" hint="Mempengaruhi pemilihan kata dialog. 'Gaul' cocok TikTok/Reels.">
              <Select value={s1.register} onChange={v => update1('register', v)} opts={LANGUAGE_REGISTERS} />
            </Field>
          </div>

          {/* (h) CTA + keyword */}
          <Field label="Call to Action (Scene Terakhir)">
            <Select value={s1.ctaType} onChange={v => update1('ctaType', v)} opts={CTA_TYPES} />
            {/* Peringatan bila Part terakhir bukan CTA. Backend kini tetap memaksa
                Part terakhir berfungsi sebagai penutup (CATATAN PENUTUP di
                buildPartBlock), tapi role yang tepat memberi hasil lebih baik:
                sutradara AI memilih FOTO berdasarkan role, dan role Body membuatnya
                memperlakukan Part penutup sebagai "tur ruangan" — pernah memilih
                carport sebagai latar ajakan penutup (2026-08-02). */}
            {s1.parts.length > 0 && s1.parts[s1.parts.length - 1].role !== 'CTA' && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-1.5">
                ⚠️ Part terakhir (Part {s1.parts.length}) berperan <strong>{s1.parts[s1.parts.length - 1].role}</strong>, bukan <strong>CTA</strong>.
                {' '}Ajakan tetap dipakai di Part terakhir, tapi Sutradara AI memilih foto berdasarkan role —
                {' '}role <strong>CTA</strong> membuatnya memilih latar penutup yang lebih pas. Ubah di <em>Rancang Part</em> di atas.
              </p>
            )}
          </Field>
          {s1.ctaType === 'comment_keyword' && (
            <Field label="Keyword Komentar" hint="Kata yang harus diketik penonton di kolom komentar">
              <input type="text" value={s1.ctaKeyword} maxLength={30}
                onChange={e => update1('ctaKeyword', e.target.value)}
                placeholder="cth: MINAT"
                className={`${selectCls} sm:w-60`} />
            </Field>
          )}

          {/* ── SUTRADARA AI — sengaja ditempatkan PALING BAWAH di Parameter Video.
              Alurnya dulu terbalik: tombol ini berada di tengah section, DI ATAS
              Platform/Bahasa/Tipe Hook/Tone/Gaya Visual/Tipe CTA — sehingga AI
              disuruh menyutradarai pembuka (Hook) dan penutup (CTA) sebelum user
              memilih Tipe Hook dan Tipe CTA-nya. Lebih parah lagi, payload ke
              suggest-storyboard dulu HANYA mengirim archetype/register/ai_tool,
              jadi brief kreatifnya memang tidak pernah sampai ke AI dan hasilnya
              generik. Sekarang: brief diisi dulu → sutradara AI jalan terakhir.
              JANGAN pindahkan blok ini ke atas field parameter mana pun. */}
          <div className="rounded-xl border border-[#1565C0]/25 bg-[#F8FBFF] p-3 space-y-2">
            {/* Sumber AI — pola sama dengan tab "AI Generate", tapi state-nya sendiri.
                Titik hijau/kuning/merah = status kuota tiap provider, jadi user bisa
                melihat mana yang masih hidup SEBELUM menekan tombol, bukan setelah gagal. */}
            <div>
              <label className="block text-[11px] font-semibold text-[#0F172A] mb-1">🤖 Sumber AI</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-1.5">
                {AI_PROVIDER_LIST.map(p => {
                  const st = suggestAiStatus?.[p.id];
                  const active = suggestProvider === p.id;
                  return (
                    <button key={p.id} type="button" onClick={() => setSuggestProvider(p.id)}
                      title={st?.detail ?? 'memuat status…'}
                      className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        active ? 'bg-[#EFF6FF] border-[#1565C0] text-[#1565C0]' : 'bg-white border-gray-200 text-[#64748B] hover:bg-gray-50'
                      }`}>
                      <span className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: st ? AI_STATUS_COLOR[st.color] : '#CBD5E1' }} />
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <select value={suggestModel} onChange={e => setSuggestModel(e.target.value)}
                disabled={suggestModelsLoading || suggestModels.length === 0}
                className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-[#1565C0] bg-white">
                {suggestModelsLoading && <option>Memuat model…</option>}
                {!suggestModelsLoading && suggestModels.length === 0 && <option value="">— Key belum diatur di Pengaturan —</option>}
                {suggestModels.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <p className="text-[10px] text-[#94A3B8] mt-1">
                Hanya <strong>Gemini</strong> yang bisa melihat foto. Provider lain tetap bisa merancang, tapi dari label foto saja.
                Kalau pilihanmu gagal/kehabisan kuota, sistem otomatis mencoba provider lain.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={suggestStoryboard} disabled={suggestLoading || s1.parts.length === 0}
                className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-[#1565C0]/30 bg-white text-[#1565C0] hover:bg-[#F0F7FF] disabled:opacity-50 disabled:cursor-not-allowed">
                {suggestLoading ? 'Merancang…' : '🤖 AI Rancang Storyboard'}
              </button>
              {suggestUsedVision != null && (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${suggestUsedVision ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
                  title={suggestUsedVision ? `Dirancang dengan visi AI (${suggestProviderUsed})` : `Mode teks saja — provider bervisi tidak tersedia (${suggestProviderUsed})`}>
                  {suggestUsedVision ? `👁️ dirancang dengan visi AI (${suggestProviderUsed})` : `📝 mode teks (${suggestProviderUsed})`}
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#64748B]">
              Jalankan <strong>setelah</strong> semua parameter di atas terisi — AI membaca gaya, platform,
              tipe hook, tone, gaya bahasa, dan tipe CTA yang kamu pilih, lalu melihat foto berlabel
              (bervisi bila tersedia) untuk menentukan cuts &amp; foto referensi tiap Part.
            </p>
            {suggestError && <p className="text-xs text-red-500">{suggestError}</p>}

            {/* Hasil rancangan per Part — rationale + strip foto referensi. */}
            <div className="space-y-1.5">
              {s1.parts.map((p, idx) => {
                const refCount = p.refPhotoIds.length + (s3.useCharacter && s3.character ? 1 : 0);
                const overQuota = refCount > MAX_REF_IMAGES_PER_PART;
                return (
                  <div key={idx} className="rounded-lg bg-white border border-gray-100 px-2.5 py-2 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-semibold text-[#94A3B8] w-14 shrink-0">Part {idx + 1}</span>
                      <span className="text-[11px] text-[#64748B]">{p.role} · {p.durationSec}s · {p.cuts.length} cut</span>
                      {s3.useCharacter && s3.character && (
                        <img src={thumbSrc(s3.character.foto_url, 64)} alt={s3.character.nama}
                          title={`Karakter — ${s3.character.nama}`}
                          className="w-8 h-8 rounded object-cover border-2 border-[#1565C0]" loading="lazy" decoding="async" />
                      )}
                      {p.refPhotoIds.map(pid => {
                        const img = prop.images.find(im => im.id === pid);
                        const label = p.cuts.find(c => c.photoId === pid)?.label ?? '';
                        return img ? (
                          <img key={pid} src={thumbSrc(img.url_webp, 64)} alt={label}
                            title={label} className="w-8 h-8 rounded object-cover border border-gray-200" loading="lazy" decoding="async" />
                        ) : null;
                      })}
                      {p.cuts.length === 0 && (
                        <span className="text-[11px] text-[#94A3B8]">Belum dirancang.</span>
                      )}
                      {overQuota && (
                        <span className="text-[11px] font-semibold text-red-600">⚠ {refCount} foto melebihi kuota {MAX_REF_IMAGES_PER_PART}</span>
                      )}
                    </div>
                    {p.rationale && (
                      <p className="text-[11px] text-[#64748B] italic pl-14">💡 {p.rationale}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Section>

      {/* ─── SECTION 4 — Generate & Validate ─── */}
      <Section
        n={4} title={SECTION_TITLES[4]}
        open={step === 4} done={false}
        onToggle={() => toggleSection(4)}>
        <div className="space-y-4">

          {/* Tab toggle */}
          <div className="flex gap-2 border-b border-gray-100 -mx-1 px-1">
            {([
              { v: 'prompt', label: 'Master Prompt', icon: <Copy size={14} /> },
              { v: 'validate', label: 'Paste & Validate', icon: <FileCheck2 size={14} /> },
              { v: 'ai_generate', label: 'AI Generate ✨', icon: <Sparkles size={14} /> },
              { v: 'upload', label: 'Upload Hasil', icon: <Upload size={14} /> },
            ] as const).map(t => (
              <button key={t.v} type="button" onClick={() => setStep4Tab(t.v)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                  step4Tab === t.v
                    ? 'border-[#1565C0] text-[#1565C0]'
                    : 'border-transparent text-[#94A3B8] hover:text-[#64748B]'
                }`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* ── TAB 1: MASTER PROMPT ── */}
          {step4Tab === 'prompt' && (
            <div className="space-y-4">
              <div className="flex items-center justify-end gap-2 flex-wrap">
                <button onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: copied ? '#10B981' : 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
                  {copied ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy Prompt JSON</>}
                </button>
                <button onClick={handleCopyNatural}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: copiedNatural ? '#10B981' : 'linear-gradient(135deg, #F5A623 0%, #F59E0B 100%)' }}>
                  {copiedNatural ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy Prompt Natural</>}
                </button>
                <button onClick={handleDownload}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-[#1565C0] border border-[#1565C0]/30 hover:bg-[#F0F7FF] transition-colors">
                  <Download size={15} /> Download .txt
                </button>
                <button onClick={handleDownloadZipPerPart} disabled={zipPerPartBusy || s1.parts.length === 0}
                  title="ZIP per-Part: PROMPT.txt siap-tempel + foto referensi (LAMPIRKAN/) per Part"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)' }}>
                  {zipPerPartBusy ? <Loader2 size={15} className="animate-spin" /> : <FileArchive size={15} />}
                  {zipPerPartBusy ? 'Menyiapkan ZIP…' : 'Download ZIP per-Part'}
                </button>
              </div>
              {zipPerPartError && <p className="text-xs text-red-600">{zipPerPartError}</p>}

              <p className="text-sm text-[#64748B]">
                <strong>Prompt JSON</strong>: salin, paste ke AI eksternal (mis. ChatGPT/Gemini/Claude) untuk menghasilkan JSON per Part,
                lalu buka tab <strong>Paste &amp; Validate</strong> untuk menempel hasilnya. <strong>Prompt Natural</strong>: paragraf
                naratif per Part (data sama persis) — cocok untuk di-paste langsung ke tool percakapan seperti Google Flow/Veo.
                {' '}<strong>ZIP per-Part</strong>: satu folder per Part berisi <code>PROMPT.txt</code> + folder <code>LAMPIRKAN/</code>
                berisi foto referensi bernama IDENTIK dengan yang disebut di PROMPT.txt.
              </p>

              {/* Thumbnail — prompt visual (AI image-gen, TANPA teks) + composite Cloudinary
                  (judul/harga/spek) YANG SUDAH ADA, TIDAK DIUBAH. Model image-gen buruk
                  merender teks legible, jadi teks tetap ditempel via Cloudinary, prompt visual
                  di bawah hanya untuk menghasilkan latar (fasad/agen/mood) TANPA teks. */}
              <div className="rounded-xl border border-gray-200 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="text-sm font-semibold text-[#0F172A]">🖼️ Thumbnail</div>
                    <p className="text-xs text-[#64748B]">Composite otomatis dari foto Fasad (Step 0) + judul + harga{s3.useCharacter ? ' + foto karakter' : ''}.</p>
                  </div>
                  <button type="button" onClick={loadThumbnail} disabled={thumbLoading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
                    {thumbLoading ? <><Loader2 size={15} className="animate-spin" /> Membangun…</> : '🖼️ Generate Thumbnail'}
                  </button>
                </div>
                {thumbError && <p className="text-xs text-red-600">{thumbError}</p>}
                {thumbData && (
                  <div className="space-y-2">
                    <img src={thumbData.thumbnail_url} alt="Thumbnail" className="w-full max-w-xs rounded-xl border border-gray-200" />
                    {thumbData.harga_turun && (
                      <p className="text-xs font-semibold text-emerald-600">✓ Harga turun terdeteksi otomatis: {thumbData.harga_text}</p>
                    )}
                    <button type="button" onClick={handleCopyThumbUrl}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#1565C0] border border-[#1565C0]/30 hover:bg-[#F0F7FF]">
                      {copiedThumb ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy URL Thumbnail</>}
                    </button>
                  </div>
                )}
                <details className="rounded-lg border border-gray-100 bg-[#F8FAFC]">
                  <summary className="cursor-pointer px-3 py-1.5 text-xs font-semibold text-[#64748B]">Prompt Visual Thumbnail (AI image-gen, tanpa teks)</summary>
                  <div className="px-3 pb-3 pt-1 space-y-2">
                    <p className="text-[11px] text-[#94A3B8]">Untuk AI image-gen (mis. Midjourney/Ideogram) bila ingin variasi latar selain foto Fasad asli. Teks judul/harga TETAP lewat composite Cloudinary di atas — model image-gen buruk merender teks legible.</p>
                    <pre className="w-full p-2.5 border border-gray-200 rounded-lg text-xs font-mono text-[#0F172A] bg-white whitespace-pre-wrap break-words">{thumbnailVisualPrompt}</pre>
                    <button type="button" onClick={handleCopyThumbPrompt}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#1565C0] border border-[#1565C0]/30 hover:bg-[#F0F7FF]">
                      {copiedThumbPrompt ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy Prompt Visual</>}
                    </button>
                  </div>
                </details>
              </div>

              <details className="rounded-xl border border-amber-200 bg-amber-50/50">
                <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-amber-800">Pratinjau Prompt Natural</summary>
                <textarea readOnly value={naturalPrompt}
                  className="w-full h-72 max-h-[50vh] overflow-y-auto p-3 border-t border-amber-200 text-xs font-mono text-[#0F172A] bg-white outline-none resize-y leading-relaxed"
                />
              </details>

              {/* Style Pair A/B — bandingkan 2 gaya untuk uji split */}
              <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl bg-[#F8FAFC] border border-gray-100">
                <span className="text-xs font-semibold text-[#0F172A]">🅰️🅱️ Style Pair A/B</span>
                <span className="text-xs text-[#64748B]">Bandingkan gaya berbeda:</span>
                <select value={abVariant} onChange={e => setAbVariant(e.target.value)}
                  className="text-sm px-2 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-[#1565C0]">
                  <option value="">— Nonaktif —</option>
                  {ARCHETYPES.filter(a => a.id !== s1.archetype).map(a => (
                    <option key={a.id} value={a.id}>Varian B: {a.emoji} {a.label}</option>
                  ))}
                </select>
                {abVariant && (
                  <span className="text-[11px] text-[#64748B]">
                    A = {findArchetype(s1.archetype)?.label ?? 'Kustom'} · B = {findArchetype(abVariant)?.label}
                  </span>
                )}
              </div>

              {abVariant && <div className="text-xs font-semibold text-[#1565C0]">Varian A — {findArchetype(s1.archetype)?.label ?? 'Kustom'}</div>}
              <textarea readOnly value={masterPrompt}
                className="w-full h-96 max-h-[60vh] overflow-y-auto p-3 border border-gray-200 rounded-xl text-xs font-mono text-[#0F172A] bg-[#F8FAFC] outline-none resize-y leading-relaxed"
              />

              {abVariant && masterPromptB && (
                <div className="space-y-2 pt-2 border-t border-dashed border-gray-200">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-xs font-semibold text-[#7C3AED]">Varian B — {findArchetype(abVariant)?.label}</div>
                    <button onClick={handleCopyB}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                      style={{ background: copiedB ? '#10B981' : 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)' }}>
                      {copiedB ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy Varian B</>}
                    </button>
                  </div>
                  <textarea readOnly value={masterPromptB}
                    className="w-full h-96 max-h-[60vh] overflow-y-auto p-3 border border-[#7C3AED]/20 rounded-xl text-xs font-mono text-[#0F172A] bg-[#FAF8FF] outline-none resize-y leading-relaxed"
                  />
                  <p className="text-[11px] text-[#64748B]">Generate kedua varian, posting sebagai A/B test, lalu bandingkan retensi & engagement untuk menemukan gaya pemenang.</p>
                </div>
              )}

              <div className="flex items-center gap-4 flex-wrap text-xs text-[#64748B]">
                <span>Estimasi ~{estimateTokens(masterPrompt).toLocaleString('id-ID')} token</span>
                <span>·</span>
                <span>{s1.parts.length} Part</span>
                <span>·</span>
                <span>Total {totalDurationSec} detik</span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  {saving
                    ? <><Loader2 size={12} className="animate-spin" /> menyimpan riwayat…</>
                    : generationId
                      ? <><Check size={12} className="text-emerald-500" /> riwayat tersimpan #{generationId}</>
                      : 'riwayat belum tersimpan'}
                </span>
              </div>
            </div>
          )}

          {/* ── TAB: AI GENERATE (Jalur C) ── */}
          {step4Tab === 'ai_generate' && prop && (
            <AIGenerateTabMemo
              propertyId={prop.id}
              propertyTitle={prop.title}
              kodeListingStr={prop.kode_listing}
              partSpecs={partSpecsForAI}
              platform={platformForAI}
              platforms={s1.platforms}
              aiTool={s1.aiTool}
              ratio={s1.ratio}
              bahasa={mapLanguageToBahasa(s1.language)}
              tone={s1.tone}
              visualStyle={s1.visualStyle}
              hookType={s1.hookType}
              ctaType={s1.ctaType}
              archetype={s1.archetype}
              register={s1.register}
              cutawayExcluded={s1.cutawayExcluded}
              selectedKarakter={selectedKarakterForAI}
              onEditStep={setStep}
              pilihMusikRotasi={pilihMusikRotasi}
            />
          )}

          {/* ── TAB 5: UPLOAD HASIL (Cloudinary, tertaut karakter/agent) ──
              Tab "Content Library" dulu ada di sini dan dihapus 2026-08-02: tabelnya
              (`viralframe_videos`) 0 baris dan tidak ada satu pun kode yang menulis ke
              sana sejak fitur Video VO dihapus (commit 1e3c17a) — jadi tab itu tidak
              akan pernah bisa berisi apa pun. Analitik "Performa per Gaya" yang dulu
              menumpang di sana sekarang tinggal di halaman Konten Agent. ── */}
          {step4Tab === 'upload' && prop && (
            <UploadAgentVideoMemo
              propertyId={prop.id}
              kodeListing={prop.kode_listing}
              defaultCharacterId={s3.character?.id ?? null}
              platform={platformForAI}
              registerInstruction={REGISTER_INSTRUCTION[s1.register] ?? ''}
              gaya={s1.archetype}
              jenisProperti={prop.jenis_properti}
            />
          )}

          {/* ── TAB 2: PASTE & VALIDATE ── */}
          {step4Tab === 'validate' && (
            <div className="space-y-4">
              <p className="text-sm text-[#64748B]">
                Tempel hasil JSON dari AI eksternal di sini, lalu klik Validasi. Part Cards &amp; tombol unduh ZIP akan muncul jika JSON valid.
              </p>

              <textarea value={pasteRaw} onChange={e => setPasteRaw(e.target.value)}
                placeholder="Paste hasil JSON dari AI di sini (ChatGPT/Gemini/Claude)..."
                className="w-full h-56 max-h-[50vh] p-3 border border-gray-200 rounded-xl text-xs font-mono text-[#0F172A] bg-[#F8FAFC] outline-none focus:border-[#1565C0] resize-y leading-relaxed"
              />

              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={handleValidate} disabled={!pasteRaw.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
                  <FileCheck2 size={15} /> Validasi JSON
                </button>

                <button onClick={handleDownloadZip}
                  disabled={!validData || zipBusy}
                  title={!validData ? 'Validasi JSON dulu sebelum mengunduh ZIP' : 'Unduh foto + prompt + caption sebagai ZIP'}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-[#1565C0] border border-[#1565C0]/30 hover:bg-[#F0F7FF] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {zipBusy ? <Loader2 size={15} className="animate-spin" /> : <FileArchive size={15} />}
                  {zipBusy ? 'Menyiapkan ZIP…' : 'Download ZIP'}
                </button>
              </div>

              {/* Error box (hard error) */}
              {valResult && valResult.errors.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                  <div className="flex items-center gap-2 text-red-700 font-semibold text-sm mb-1.5">
                    <AlertCircle size={15} /> JSON tidak bisa diproses:
                  </div>
                  <ul className="list-disc list-inside text-sm text-red-600 space-y-0.5">
                    {valResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}

              {/* Warning box (dismissible, non-blocking) */}
              {valResult && valResult.ok && valResult.warnings.length > 0 && !warningsDismissed && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 relative">
                  <button onClick={() => setWarningsDismissed(true)}
                    className="absolute top-3 right-3 text-amber-500 hover:text-amber-700"><X size={15} /></button>
                  <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm mb-1.5">
                    <AlertCircle size={15} /> {valResult.warnings.length} peringatan (tidak menghalangi):
                  </div>
                  <ul className="list-disc list-inside text-sm text-amber-700 space-y-0.5">
                    {valResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              {zipError && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600">{zipError}</div>
              )}

              {/* Part Cards */}
              {validData && (
                <div className="pt-1">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 mb-3">
                    <Check size={15} /> JSON valid — {validData.parts?.length ?? 0} Part
                  </div>
                  <PartCards data={validData} />
                </div>
              )}
            </div>
          )}

          {/* Tahap 2: Caption Studio — tampil di semua tab Step 4 */}
          {prop && (
            <div className="mt-4">
              <CaptionStudioMemo
                propertyId={prop.id}
                platform={s1.platforms[0] ?? 'tiktok'}
                registerInstruction={REGISTER_INSTRUCTION[s1.register] ?? ''}
              />
            </div>
          )}
        </div>
        {/* Section terakhir: hanya "Kembali" — tidak ada step sesudahnya. */}
        <div className="flex pt-1">
          <button onClick={goBack}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-[#64748B] border border-gray-200 hover:bg-gray-50 transition-colors">
            <ArrowLeft size={15} /> Kembali
          </button>
        </div>
      </Section>
      </>)}
    </div>
  );
}
