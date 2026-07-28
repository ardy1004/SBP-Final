import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router';
import {
  ArrowLeft, ArrowRight, ImageOff, Check, Film, AlertCircle,
  Copy, Download, Loader2, FileCheck2, FileArchive, X, Sparkles, History, Trash2, RefreshCw, Upload, Music,
} from 'lucide-react';
// JSZip di-dynamic-import di handler (bukan static) agar tidak masuk chunk awal workspace.
import {
  AI_TOOLS, RATIOS, LANGUAGES, HOOK_TYPES, CTA_TYPES, VISUAL_STYLES,
  TONES, PLATFORMS, PHOTO_LABELS, LANGUAGE_REGISTERS, REGISTER_INSTRUCTION,
  sceneFileName, characterFileName, AI_TOOL_FORMAT_SPEC,
  isNativeAudioTool, getClipMaxSec, namaFileKarakter, PLATFORM_BEHAVIOR,
  sceneRoleFromParts, partIndexForScene, partsValidForTotal, type PartDef,
  RULEBOOK_VERSION,
} from './viralframe/options';
import CharacterStepBase, { type Step3State } from './viralframe/CharacterStep';
import BacksoundPicker, { backsoundMediaUrl, type BacksoundItem } from './viralframe/BacksoundPicker';
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
  PLATFORM_OPTIONS, MUSIK_OPTIONS, FOTO_LABEL_OPTIONS,
} from '../../lib/viralframe-constants';
import { compileMasterPrompt, estimateTokens } from './viralframe/masterPromptCompiler';
import { validateSceneJson, type ParsedJSON, type ValidateResult } from './viralframe/jsonValidator';
import SceneCardsBase from './viralframe/SceneCards';
const SceneCards = memo(SceneCardsBase);

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
  sceneCount: number;
  durationMode: 'uniform' | 'manual';
  uniformDuration: number;
  manualDurations: number[];
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
  // Nomor scene (1-based) yang DIKECUALIKAN dari pola cutaway B-roll arketipe hybrid
  // (agent_broll_hybrid/selfie_luxury_hybrid) — scene itu jadi talking-head/selfie
  // penuh durasi tanpa cutaway. Hanya relevan bila archetype.allowMultiShotPerScene.
  cutawayExcluded: number[];
  /** Pengelompokan naratif opsional di atas Scene (Fase 6) — lihat PartDef di options.ts.
   * undefined/tidak valid = fallback sceneRole() posisi lama (draft/riwayat lama tetap jalan). */
  parts?: PartDef[];
}

interface SceneAssign { photoId: number | null; label: string }

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

function resize<T>(arr: T[], len: number, fill: () => T): T[] {
  const next = arr.slice(0, len);
  while (next.length < len) next.push(fill());
  return next;
}

// R8: bangun subtitle .SRT dari narasi per scene + durasi (timing kumulatif).
function srtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))},${p(ms % 1000, 3)}`;
}
function buildSrt(scenes: { script_narration?: string }[], durations: number[]): string {
  let t = 0; const out: string[] = []; let idx = 1;
  scenes.forEach((sc, i) => {
    const dur = durations[i] ?? durations[0] ?? 6;
    const text = (sc.script_narration ?? '').trim();
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

function StepIndicator({ current }: { current: number }) {
  const steps = [
    { n: 1, label: 'Pilih Foto per Scene', enabled: true },
    { n: 2, label: 'Pilih Karakter', enabled: true },
    { n: 3, label: 'Parameter Video', enabled: true },
    { n: 4, label: 'Generate Prompt', enabled: true },
  ];
  return (
    <div className="flex items-center">
      {steps.map((s, i) => {
        const done = current > s.n;
        const active = current === s.n;
        return (
          <div key={s.n} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  active ? 'text-white' : done ? 'text-white' : s.enabled ? 'text-[#64748B] bg-gray-100' : 'text-[#CBD5E1] bg-gray-50'
                }`}
                style={active || done ? { background: ACCENT } : undefined}
              >
                {done ? <Check size={15} /> : s.n}
              </div>
              <span className={`mt-1.5 text-[11px] font-medium text-center leading-tight max-w-[80px] ${
                active ? 'text-[#0F172A]' : 'text-[#94A3B8]'
              }`}>
                {s.label}
                {!s.enabled && <span className="block text-[9px] text-[#CBD5E1]">Segera</span>}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="flex-1 h-0.5 mx-1 mb-5 rounded" style={{ background: current > s.n ? ACCENT : '#E2E8F0' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Jalur B: Video VO constants & component ────────────────────────────────

// PENTING (image-to-video): prompt ini WAJIB "motion-only + scene-preserving".
// Foto yang dikirim = frame pertama; deskripsi ADEGAN/pencahayaan/objek yang tidak
// ada di foto akan membuat model (Wan2.2 I2V) melenceng dari foto. Jadi:
//  - HANYA jelaskan gerakan kamera + perintah menjaga adegan tetap sama.
//  - JANGAN sebut "facade/interior/sky/golden hour/neighborhood" (biarkan foto yang menentukan).
//  - Utamakan gerakan yang TIDAK menuntut area di luar frame (push-in/dolly/pan/parallax);
//    gerakan "reveal/pull-back/orbit" dibatasi ringan agar tidak memaksa mengarang.
const GAYA_KAMERA = [
  { label: '▶️ Push-in Lembut', value: 'dolly_pushin', prompt: 'slow steady push-in, camera moves gently forward into the existing scene, smooth cinematic motion, subtle natural parallax, keep the scene, architecture, objects and lighting exactly as shown, no new elements' },
  { label: '🏠 Walk-through', value: 'walkthrough', prompt: 'slow steady forward gimbal glide through the existing space, smooth stabilized motion, first-person tour feel, preserve the scene, layout and lighting exactly as shown, gentle natural parallax, no new elements' },
  { label: '🎯 Detail Pan', value: 'close_detail', prompt: 'slow gentle lateral pan across the existing scene, smooth micro-movement, shallow depth of field, keep all elements, textures and lighting consistent with the reference image, no new objects' },
  { label: '↕️ Tilt Halus', value: 'gentle_tilt', prompt: 'slow smooth vertical tilt over the existing scene, subtle steady motion, keep the architecture, framing and lighting exactly as shown, natural parallax, no new elements' },
  { label: '🤏 Slow Zoom-in', value: 'slow_zoom', prompt: 'very slow cinematic zoom-in on the existing scene, minimal steady motion, preserve every detail, geometry and lighting of the reference image, no distortion, no new objects' },
  { label: '🚁 Pull-back Ringan', value: 'drone_pullback', prompt: 'slow gentle pull-back, camera eases steadily backward while keeping the existing scene consistent, smooth stable motion, natural parallax, do not invent areas outside the original framing, no new elements' },
  { label: '🔄 Orbit Ringan', value: 'aerial_orbit', prompt: 'slow subtle orbital drift around the existing subject, small stable arc, keep the scene, architecture and lighting consistent with the reference image, minimal reveal, no new elements' },
];

const RASIO_OPTIONS = [
  { label: '16:9 — Landscape (YouTube/properti)', value: '1280x720', w: 1280, h: 720 },
  { label: '9:16 — Portrait (TikTok/Reels)', value: '720x1280', w: 720, h: 1280 },
  { label: '1:1 — Square (Instagram feed)', value: '960x960', w: 960, h: 960 },
] as const;
type RasioValue = typeof RASIO_OPTIONS[number]['value'];

interface VOScene {
  foto_id: number | null;
  foto_url: string | null;
  gaya_kamera: string;
  prompt_en: string;
}

interface VideoResult {
  scene_index: number;
  request_id: string | null;
  status: 'idle' | 'pending' | 'processing' | 'succeed' | 'failed';
  video_url: string | null;
  blob: Blob | null;
}

interface VideoVOTabProps {
  propertyId: number;
  propertyTitle: string;
  jenisProperti: string;
  lokasi: string;
  photos: PropertyImage[];
}

function VideoVOTab({ propertyId, propertyTitle, jenisProperti, lokasi, photos }: VideoVOTabProps) {
  const [voScenes, setVoScenes] = useState<VOScene[]>([
    { foto_id: null, foto_url: null, gaya_kamera: '', prompt_en: '' },
  ]);
  const [naskah, setNaskah] = useState('');
  const [isGeneratingNaskah, setIsGeneratingNaskah] = useState(false);
  const [videoResults, setVideoResults] = useState<VideoResult[]>([]);
  const [isGeneratingVideos, setIsGeneratingVideos] = useState(false);
  const [voiceoverUrl, setVoiceoverUrl] = useState<string | null>(null);
  const [voiceoverBlob, setVoiceoverBlob] = useState<Blob | null>(null);
  const [isGeneratingVO, setIsGeneratingVO] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeProgress, setMergeProgress] = useState('');
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [genError, setGenError] = useState('');
  const [rasio, setRasio] = useState<RasioValue>('1280x720');
  // Polling status video (sampai 120s per scene) tidak punya guard sama sekali
  // sebelumnya — dulu terus jalan di background walau user pindah tab/step
  // (audit 2026-07-28). Dicek di setiap iterasi loop di bawah.
  const cancelledRef = useRef(false);
  useEffect(() => () => { cancelledRef.current = true; }, []);

  const wordCount = naskah.trim() ? naskah.trim().split(/\s+/).length : 0;
  const targetWords = Math.floor(voScenes.length * 8 * 1.9);
  const wordPct = targetWords > 0 ? ((wordCount - targetWords) / targetWords) * 100 : 0;

  const addScene = () => {
    if (voScenes.length >= 6) return;
    setVoScenes(prev => [...prev, { foto_id: null, foto_url: null, gaya_kamera: '', prompt_en: '' }]);
  };
  const removeScene = (idx: number) => {
    if (voScenes.length <= 1) return;
    setVoScenes(prev => prev.filter((_, i) => i !== idx));
  };
  const updateScene = (idx: number, patch: Partial<VOScene>) =>
    setVoScenes(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));

  const handleGenerateNaskah = async () => {
    setIsGeneratingNaskah(true);
    try {
      const res = await fetch('/api/admin/viralframe/generate-naskah', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ property_title: propertyTitle, jenis_properti: jenisProperti, lokasi, jumlah_scene: voScenes.length, durasi_per_scene: 8 }),
      });
      // CATATAN: generate-naskah.js memakai Response.json() polos, BUKAN jsonOk(),
      // jadi TIDAK ada amplop {success,data}. Satu-satunya endpoint admin yang
      // menyimpang dari konvensi response.js — jangan pasang bacaJson di sini.
      const json = await res.json() as { naskah?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setNaskah(json.naskah ?? '');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal generate naskah');
    } finally {
      setIsGeneratingNaskah(false);
    }
  };

  const photoToBase64WithRatio = async (foto_url: string, targetRatio: RasioValue): Promise<string> => {
    const opt = RASIO_OPTIONS.find(r => r.value === targetRatio)!;
    const src = mediaSrc(foto_url);
    if (!src) throw new Error('URL foto tidak valid');
    const res = await fetch(src, { credentials: 'include' });
    if (!res.ok) throw new Error(`Gagal fetch foto (HTTP ${res.status})`);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      const objectUrl = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        // Center crop ke target ratio
        const targetAspect = opt.w / opt.h;
        const srcAspect = img.naturalWidth / img.naturalHeight;
        let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
        if (srcAspect > targetAspect) {
          // sumber lebih lebar — crop kiri kanan
          sw = Math.round(img.naturalHeight * targetAspect);
          sx = Math.round((img.naturalWidth - sw) / 2);
        } else {
          // sumber lebih tinggi — crop atas bawah
          sh = Math.round(img.naturalWidth / targetAspect);
          sy = Math.round((img.naturalHeight - sh) / 2);
        }
        // Gunakan dimensi penuh dari rasio option — tidak ada MAX limit
        // karena SiliconFlow dipanggil langsung dari browser (tidak lewat Worker)
        // number eksplisit: opt.w/opt.h bertipe literal union (1280|960|720),
        // sedangkan keduanya diskalakan ulang beberapa baris di bawah.
        let cw: number = opt.w;
        let ch: number = opt.h;
        // Jika source crop area lebih kecil dari target, scale down proportionally
        if (sw < cw || sh < ch) {
          const scale = Math.min(sw / cw, sh / ch);
          // cw/ch berasal dari literal union (1280|960|720); setelah diskalakan
          // nilainya jadi sembarang, jadi lebarkan tipenya ke number.
          cw = Math.round(cw * scale);
          ch = Math.round(ch * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas tidak tersedia')); return; }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
        const base64 = canvas.toDataURL('image/jpeg', 0.80); // return FULL data URL dengan prefix
        console.log(`[VideoVO] rasio=${targetRatio} canvas=${cw}x${ch} filesize=~${Math.round(base64.length * 0.75 / 1024)}KB`);
        resolve(base64);
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Gagal load foto')); };
      img.src = objectUrl;
    });
  };

  const handleGenerateVideos = async () => {
    setIsGeneratingVideos(true);
    setGenError('');
    setVideoResults(voScenes.map((_, i) => ({ scene_index: i, request_id: null, status: 'idle', video_url: null, blob: null })));
    try {
      for (let i = 0; i < voScenes.length; i++) {
        if (cancelledRef.current) break;
        const scene = voScenes[i];
        if (!scene.foto_url || !scene.gaya_kamera) continue;
        const image_base64 = await photoToBase64WithRatio(scene.foto_url, rasio);
        // Submit via proxy Worker — API key SiliconFlow tidak pernah keluar ke browser.
        const sfSubmitRes = await fetch('/api/admin/viralframe/submit-video', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_base64,
            prompt: scene.prompt_en,
            model: 'Wan-AI/Wan2.2-I2V-A14B',
            image_size: rasio,
            scene_index: i,
          }),
        });
        if (!sfSubmitRes.ok) {
          const errText = await sfSubmitRes.text();
          throw new Error(`Scene ${i + 1}: submit gagal HTTP ${sfSubmitRes.status} — ${errText.slice(0, 200)}`);
        }
        // SiliconFlow API eksternal — bentuk responsnya milik mereka, bukan amplop kita.
        const sfJson = await sfSubmitRes.json() as Record<string, any>;
        const request_id = sfJson.request_id ?? sfJson.requestId ?? null;
        if (!request_id) {
          throw new Error(`Scene ${i + 1}: server tidak return request_id: ${JSON.stringify(sfJson).slice(0, 200)}`);
        }
        setVideoResults(prev => prev.map((r, ri) => ri === i ? { ...r, request_id, status: 'pending' } : r));
        // Poll until done (max 40 × 3s = 120s). statusRes.ok/videoRes.ok TIDAK
        // pernah dicek sebelumnya (audit 2026-07-28) — 502/504 dari Worker bikin
        // .json() melempar SyntaxError mentah yang membunuh SELURUH batch (scene
        // lain yang belum diproses ikut gagal), atau halaman error tersimpan
        // sebagai "video" yang diupload ke library. Sekarang: gagal transient di
        // satu scene tidak menghentikan scene lain — loop lanjut ke scene berikutnya.
        let done = false;
        for (let p = 0; p < 40 && !done; p++) {
          if (cancelledRef.current) { done = true; break; }
          await new Promise(r => setTimeout(r, 3000));
          const statusRes = await fetch(`/api/admin/viralframe/video-status/${request_id}`, { credentials: 'include' });
          if (!statusRes.ok) continue; // transient — coba lagi di iterasi berikutnya
          // Sama seperti submit: proxy status meneruskan bentuk SiliconFlow apa adanya.
          const statusJson = await statusRes.json() as Record<string, any>;
          const status: VideoResult['status'] = statusJson.status ?? 'pending';
          setVideoResults(prev => prev.map((r, ri) => ri === i ? { ...r, status, video_url: statusJson.video_url ?? null } : r));
          if (status === 'succeed' && statusJson.video_url) {
            const videoRes = await fetch(statusJson.video_url);
            if (!videoRes.ok) {
              done = true;
              setVideoResults(prev => prev.map((r, ri) => ri === i ? { ...r, status: 'failed' } : r));
              setGenError(prev => `${prev ? prev + ' | ' : ''}Scene ${i + 1}: gagal mengambil file video hasil (HTTP ${videoRes.status}).`);
              break;
            }
            const videoBlob = await videoRes.blob();
            setVideoResults(prev => prev.map((r, ri) => ri === i ? { ...r, blob: videoBlob } : r));
            done = true;
            // Tahap 3: simpan ke Content Library (R2 + D1) — best-effort, tak blokir UI
            try {
              const qs = new URLSearchParams({ property_id: String(propertyId), label: `Scene ${i + 1}`, gaya: scene.gaya_kamera ?? '', rasio: String(rasio) });
              fetch(`/api/admin/viralframe/videos?${qs.toString()}`, {
                method: 'POST', credentials: 'include', headers: { 'Content-Type': 'video/mp4' }, body: videoBlob,
              }).catch(() => {});
            } catch { /* noop */ }
          } else if (status === 'failed') {
            done = true;
            setVideoResults(prev => prev.map((r, ri) => ri === i ? { ...r, status: 'failed' } : r));
            setGenError(prev => `${prev ? prev + ' | ' : ''}Scene ${i + 1}: SiliconFlow gagal — ${JSON.stringify(statusJson._raw ?? statusJson.reason ?? 'no detail').slice(0, 200)}`);
          }
        }
        if (!done) setVideoResults(prev => prev.map((r, ri) => ri === i ? { ...r, status: 'failed' } : r));
      }
    } catch (err: unknown) {
      setGenError(prev => `${prev ? prev + ' | ' : ''}${err instanceof Error ? err.message : 'Gagal generate video'}`);
    } finally {
      setIsGeneratingVideos(false);
    }
  };

  const handleGenerateVO = async () => {
    if (!naskah.trim() || isGeneratingVO) return;
    setIsGeneratingVO(true);
    try {
      const res = await fetch('/api/admin/viralframe/generate-voiceover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ naskah: naskah.trim(), voice: 'alloy' }),
      });
      if (!res.ok) {
        const err = await bacaJson(res);
        throw new Error(err.error ?? 'Gagal generate voiceover');
      }
      const blob = new Blob([await res.arrayBuffer()], { type: res.headers.get('Content-Type') || 'audio/mpeg' });
      setVoiceoverBlob(blob);
      // Revoke URL lama sebelum ganti — dulu tidak pernah di-revoke sama sekali
      // (audit 2026-07-28), regenerate VO berkali-kali membocorkan 1 blob URL
      // per percobaan sepanjang sesi tab terbuka.
      setVoiceoverUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal generate voiceover');
    } finally {
      setIsGeneratingVO(false);
    }
  };

  const handleMerge = async () => {
    if (!voiceoverBlob || isMerging) return;
    setIsMerging(true);
    setMergeProgress('Loading FFmpeg…');
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { FFmpeg } = await import('@ffmpeg/ffmpeg') as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { fetchFile } = await import('@ffmpeg/util') as any;
      const ffmpeg = new FFmpeg();
      ffmpeg.on('log', ({ message }: { message: string }) => setMergeProgress(message));
      await ffmpeg.load();
      for (let i = 0; i < videoResults.length; i++) {
        const r = videoResults[i];
        if (!r.blob) throw new Error(`Scene ${i + 1} belum selesai`);
        await ffmpeg.writeFile(`scene${i}.mp4`, await fetchFile(r.blob));
      }
      await ffmpeg.writeFile('voiceover.mp3', await fetchFile(voiceoverBlob));
      const concatContent = videoResults.map((_, i) => `file 'scene${i}.mp4'`).join('\n');
      await ffmpeg.writeFile('concat.txt', concatContent);
      await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', 'combined.mp4']);
      await ffmpeg.exec(['-i', 'combined.mp4', '-i', 'voiceover.mp3', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-shortest', 'final.mp4']);
      const data = await ffmpeg.readFile('final.mp4');
      // Revoke URL lama sebelum ganti — sama seperti voiceoverUrl di atas.
      setFinalVideoUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
      });
      setMergeProgress('✅ Selesai!');
    } catch (err: unknown) {
      setMergeProgress(`Error: ${err instanceof Error ? err.message : 'Gagal merge'}`);
    } finally {
      setIsMerging(false);
    }
  };

  const canGenerateVideos = voScenes.every(s => s.foto_id !== null && s.gaya_kamera !== '');
  const allVideosReady = videoResults.length === voScenes.length && videoResults.length > 0 && videoResults.every(r => r.blob !== null);

  // R4: cegah tutup/refresh tab saat proses berjalan (video/merge/VO) — hindari kehilangan kerja.
  const voBusy = isGeneratingVideos || isMerging || isGeneratingVO;
  useEffect(() => {
    if (!voBusy) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [voBusy]);

  return (
    <div className="space-y-6 pt-2">
      {/* SECTION 1 — SCENE BUILDER */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="font-semibold text-[#0F172A] text-sm">Susun Scene Video</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1565C0] font-medium">
            {voScenes.length} scene × 8 dtk = {voScenes.length * 8} dtk
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
            Target naskah: ~{targetWords} kata
          </span>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-[#64748B]">Rasio Video:</label>
          <select
            value={rasio}
            onChange={e => setRasio(e.target.value as RasioValue)}
            className={`${selectCls} w-auto`}
          >
            {RASIO_OPTIONS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {voScenes.map((scene, i) => {
          const selectedPhoto = photos.find(p => p.id === scene.foto_id);
          return (
            <div key={i} className="border border-gray-100 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-[#0F172A]">Scene {i + 1}</span>
                {voScenes.length > 1 && (
                  <button type="button" onClick={() => removeScene(i)} className="text-[#94A3B8] hover:text-red-500 transition-colors p-1">
                    <X size={15} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  {selectedPhoto && (
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200">
                      <img src={thumbSrc(selectedPhoto.url_webp, 480)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                    </div>
                  )}
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-[#64748B] mb-1">Foto</label>
                    <select
                      value={scene.foto_id ?? ''}
                      onChange={e => {
                        const pid = Number(e.target.value) || null;
                        const photo = photos.find(p => p.id === pid);
                        updateScene(i, { foto_id: pid, foto_url: photo?.url_webp ?? null });
                      }}
                      className={selectCls}
                    >
                      <option value="">— Pilih foto —</option>
                      {photos.map(p => (
                        <option key={p.id} value={p.id}>Foto #{p.urutan}{p.is_cover ? ' (Cover)' : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#64748B] mb-1">Gaya Kamera</label>
                  <select
                    value={scene.gaya_kamera}
                    onChange={e => {
                      const gk = GAYA_KAMERA.find(g => g.value === e.target.value);
                      updateScene(i, { gaya_kamera: e.target.value, prompt_en: gk?.prompt ?? '' });
                    }}
                    className={selectCls}
                  >
                    <option value="">— Pilih gaya kamera —</option>
                    {GAYA_KAMERA.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          );
        })}

        <button type="button" onClick={addScene} disabled={voScenes.length >= 6}
          className="w-full py-2 rounded-xl text-sm font-medium text-[#1565C0] border border-dashed border-[#1565C0]/40 hover:bg-[#F0F7FF] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          + Tambah Scene{voScenes.length >= 6 ? ' (max 6)' : ''}
        </button>
      </div>

      {/* SECTION 2 — NASKAH VOICEOVER */}
      <div className="space-y-3 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-semibold text-[#0F172A] text-sm">Naskah Voiceover</h3>
          <button type="button" onClick={handleGenerateNaskah} disabled={isGeneratingNaskah}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)' }}>
            {isGeneratingNaskah
              ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating...</>
              : <><Sparkles size={13} /> ✨ Generate Naskah (DeepSeek)</>}
          </button>
        </div>
        <textarea value={naskah} onChange={e => setNaskah(e.target.value)} rows={6}
          placeholder="Tulis atau generate naskah voiceover di sini…"
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] resize-y transition-colors" />
        <div className="flex items-center gap-2 text-xs">
          <span className={`font-medium ${wordCount === 0 ? 'text-[#94A3B8]' : Math.abs(wordPct) <= 10 ? 'text-emerald-600' : 'text-amber-600'}`}>
            {wordCount} kata
          </span>
          <span className="text-[#94A3B8]">/ target ~{targetWords} kata</span>
          {wordCount > 0 && (Math.abs(wordPct) <= 10
            ? <span className="text-emerald-600">✅ Pas</span>
            : wordCount < targetWords
              ? <span className="text-amber-600">⚠️ Kurang {Math.round(Math.abs(wordPct))}%</span>
              : <span className="text-amber-600">⚠️ Kelebihan {Math.round(wordPct)}%</span>)}
        </div>
      </div>

      {/* SECTION 3 — GENERATE & OUTPUT */}
      <div className="space-y-5 pt-4 border-t border-gray-100">

        {/* 3A — Generate Video */}
        <div className="space-y-3">
          <h3 className="font-semibold text-[#0F172A] text-sm">Generate Video per Scene</h3>
          {!canGenerateVideos && (
            <p className="text-xs text-amber-600">⚠️ Lengkapi foto dan gaya kamera untuk semua scene.</p>
          )}
          <button type="button" onClick={handleGenerateVideos} disabled={!canGenerateVideos || isGeneratingVideos}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
            {isGeneratingVideos
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating...</>
              : '🎬 Generate Semua Video (SiliconFlow)'}
          </button>
          {videoResults.length > 0 && (
            <div className="space-y-1.5 text-sm">
              {videoResults.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[#64748B] w-16 flex-shrink-0">Scene {i + 1}</span>
                  <span className={r.status === 'succeed' ? 'text-emerald-600' : r.status === 'failed' ? 'text-red-600' : r.status === 'idle' ? 'text-[#94A3B8]' : 'text-amber-600'}>
                    {r.status === 'succeed' ? '✅ Selesai' : r.status === 'failed' ? '❌ Gagal' : r.status === 'idle' ? '⬜ Menunggu' : r.status === 'pending' ? '⏳ Dalam antrian…' : '⚙️ Processing…'}
                  </span>
                </div>
              ))}
            </div>
          )}
          {genError && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">{genError}</div>}
        </div>

        {/* 3B — Generate Voiceover */}
        <div className="space-y-3 pt-3 border-t border-gray-100">
          <h3 className="font-semibold text-[#0F172A] text-sm">Generate Voiceover</h3>
          <button type="button" onClick={handleGenerateVO} disabled={!naskah.trim() || isGeneratingVO}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)' }}>
            {isGeneratingVO
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating...</>
              : '🎙️ Generate Voiceover (Pollinations)'}
          </button>
          {voiceoverUrl && <audio controls src={voiceoverUrl} className="w-full mt-1" />}
        </div>

        {/* 3C — Merge & Download */}
        <div className="space-y-3 pt-3 border-t border-gray-100">
          <h3 className="font-semibold text-[#0F172A] text-sm">Gabungkan &amp; Download</h3>
          <button type="button" onClick={handleMerge} disabled={!allVideosReady || !voiceoverBlob || isMerging}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #DC2626 0%, #F97316 100%)' }}>
            {isMerging
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Merging...</>
              : '🔀 Gabungkan & Download Final.mp4'}
          </button>
          {mergeProgress && (
            <p className="text-xs font-mono text-[#64748B] bg-gray-50 rounded-lg px-3 py-2 break-all">{mergeProgress}</p>
          )}
          {finalVideoUrl && (
            <div className="space-y-2">
              <video controls src={finalVideoUrl} className="w-full rounded-xl border border-gray-100" />
              <a href={finalVideoUrl} download="final.mp4"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
                <Download size={15} /> Download final.mp4
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Jalur C: AI Generate component ─────────────────────────────────────────
// Konstanta (PLATFORM_OPTIONS, MUSIK_OPTIONS,
// FOTO_LABEL_OPTIONS) diimport dari ../../lib/viralframe-constants — sumber
// tunggal yang sama dipakai step Foto & Parameter agar value enum tidak divergen lagi.

interface AIScene {
  scene: number; kamera: string; prompt: string; dialog_karakter: string;
  on_screen_text?: string; foto_label?: string; foto_deskripsi?: string;
  /** Hanya untuk tool ber-audio native (Veo/Flow) — disuntik server, lihat ai-generate.js. */
  negative_prompt?: string; max_clip_sec?: number | null;
  /** Beat bertimecode opsional (Fase 6) — hanya untuk scene >6s pada tool audio-native. */
  sequences?: { sequence?: number; timestamp?: string; action?: string; audio?: string }[];
}
interface AIKarakter { nama: string; deskripsi: string; foto_url: string }
interface AIMetadata {
  platform: string; ai_tool: string; bahasa: string; musik_value: string;
  judul_properti: string; kode_listing: string; generated_at: string;
  provider_used?: string; model_used?: string; provider_requested?: string; fell_back?: boolean;
}
interface AIGeneratedResult { scenes: AIScene[]; foto_urls: string[]; karakter: AIKarakter; metadata: AIMetadata }

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
interface AIGenerateTabProps {
  propertyId: number;
  propertyTitle: string;
  kodeListingStr: string;
  // Data dari Step 1 (Foto: jumlah scene + struktur Part) & Step 3 (Parameter Video)
  jumlahScene: number;
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
  cutawayExcluded: number[];
  sceneRoles: Record<number, 'Hook' | 'Body' | 'CTA'>;
  /** Durasi per scene (detik) dari Step 3 (Parameter Video), index 0 = scene 1. */
  sceneDurations: number[];
  // Data dari Step 1 (Pilih Foto per Scene)
  scenePhotos: Record<number, ScenePhoto>;
  // Data dari Step 2 (Pilih Karakter)
  selectedKarakter: AISelectedKarakter | null;
  // Navigasi balik ke step yang belum lengkap
  onEditStep: (step: number) => void;
}

function AIGenerateTab({
  propertyId, propertyTitle, kodeListingStr, jumlahScene, platform, platforms, aiTool, bahasa,
  ratio, tone, visualStyle, hookType, ctaType, archetype, register, cutawayExcluded, sceneRoles,
  sceneDurations, scenePhotos, selectedKarakter, onEditStep,
}: AIGenerateTabProps) {
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

  const missingScenes = Array.from({ length: jumlahScene }, (_, i) => i + 1)
    .filter(n => !scenePhotos[n]?.foto_url);
  const allScenesHavePhoto = missingScenes.length === 0;
  const canGenerate = selectedKarakter != null && allScenesHavePhoto;
  const platformOpt = PLATFORM_OPTIONS.find(p => p.value === platform);

  // Payload lengkap ai-generate dari state Step 1–3 — dipakai generate penuh
  // maupun regenerate per scene (parameter identik agar hasilnya konsisten).
  const buildGeneratePayload = () => {
    if (!selectedKarakter) return null;
    const musikOpt = MUSIK_OPTIONS.find(m => m.value === musik)!;
    const foto_assignments = Array.from({ length: jumlahScene }, (_, i) => ({
      scene: i + 1,
      foto_url: scenePhotos[i + 1]?.foto_url ?? '',
      foto_label: scenePhotos[i + 1]?.label ?? 'lainnya',
    }));
    const scene_roles = Array.from({ length: jumlahScene }, (_, i) => ({
      scene: i + 1,
      role: sceneRoles[i + 1] ?? 'Body',
    }));
    // Kirim label yang sudah diresolve (bukan raw value) — backend tinggal
    // menyisipkan teksnya, tidak perlu daftar terjemahan tone/style/hook/cta sendiri.
    const toneLabel = TONES.find(t => t.value === tone)?.label ?? tone;
    const visualStyleLabel = VISUAL_STYLES.find(v => v.value === visualStyle)?.label ?? visualStyle;
    const hookTypeLabel = HOOK_TYPES.find(h => h.value === hookType)?.label ?? hookType;
    const ctaTypeLabel = CTA_TYPES.find(c => c.value === ctaType)?.label ?? ctaType;
    const supportsRefImage = AI_TOOL_FORMAT_SPEC[aiTool]?.supportsRefImage ?? false;

    // Arketipe (opsional) — client hitung koreografi kamera per scene + arahan sutradara,
    // kirim sebagai string siap-pakai supaya backend tidak perlu menduplikasi data arketipe.
    const arc = findArchetype(archetype);
    // Durasi PER SCENE dari Parameter Video (audit 2026-07-26). Sebelumnya jalur ini memakai
    // PLATFORM_DURASI_VF sehingga pengaturan durasi Parameter Video tidak berpengaruh: budget
    // kata selalu dari 8 detik, dan beatCountForDuration(8) selalu 2 beat sehingga
    // cabang koreografi 3-beat tidak pernah tereksekusi.
    const durasiScene = (n: number) => sceneDurations[n - 1] ?? PLATFORM_DURASI_VF[platform] ?? 8;
    const scene_durations = Array.from({ length: jumlahScene }, (_, i) => ({
      scene: i + 1,
      durasi: durasiScene(i + 1),
    }));
    const archetype_note = arc
      ? `${arc.label} — ${arc.shotGrammarNote} (mode presenter: ${arc.presenterMode}, pacing: ${arc.pacing})`
      : '';
    // Scene yang dikecualikan dari cutaway (arketipe hybrid) → kirim camera hint
    // "steady, no cutaway" untuk scene itu, BUKAN koreografi cutaway biasa —
    // supaya instruksi per-scene di user prompt tidak bertentangan dengan aturan
    // "SATU shot talking-head saja" yang dikirim ke ai-generate.js.
    const cutawayExcludedInRange = arc?.allowMultiShotPerScene
      ? cutawayExcluded.filter(n => n >= 1 && n <= jumlahScene)
      : [];
    const camera_directives = arc
      ? Array.from({ length: jumlahScene }, (_, i) => {
          const sceneNum = i + 1;
          const isExcluded = cutawayExcludedInRange.includes(sceneNum);
          return {
            scene: sceneNum,
            camera: isExcluded
              ? 'steady handheld shot, presenter stays in frame throughout, no cutaway'
              : compileCameraChoreography(arc.cameraGrammar, sceneRoles[sceneNum] ?? 'Body', durasiScene(sceneNum), i, aiTool, supportsRefImage),
          };
        })
      : [];

    return {
      property_id: propertyId,
      jumlah_scene: jumlahScene,
      platform,
      ai_tool: aiTool,
      bahasa,
      tone: toneLabel,
      visual_style: visualStyleLabel,
      hook_type: hookTypeLabel,
      cta_type: ctaTypeLabel,
      scene_roles,
      scene_durations,
      musik_value: musik,
      musik_prompt: musikOpt.prompt,
      karakter_id: selectedKarakter.id,
      expression: selectedKarakter.expression,
      foto_assignments,
      supports_ref_image: supportsRefImage,
      archetype_note,
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
      const data = await readNdjsonFinal<AIGeneratedResult>(res, { signal: ac.signal });
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
          regenerate_scene: sceneNum,
          existing_scenes: generatedResult.scenes.map(s => ({
            scene: s.scene, kamera: s.kamera, dialog_karakter: s.dialog_karakter,
          })),
        }),
      });
      const data = await readNdjsonFinal<AIGeneratedResult>(res, { signal: ac.signal });
      const newScene = data.scenes?.[0];
      if (!newScene) throw new Error('AI tidak mengembalikan scene baru');
      // Backend sudah memaksa scene = regenerateScene di mode ini (lihat ai-generate.js
      // "Mode regenerate: paksa nomor scene"), tapi tetap divalidasi ulang di sini —
      // kalau backend berubah/gagal, JANGAN menimpa scene yang salah secara diam-diam.
      if (newScene.scene !== sceneNum) {
        throw new Error(`AI mengembalikan scene ${newScene.scene}, bukan scene ${sceneNum} yang diminta — tidak disimpan.`);
      }
      setGeneratedResult(prev => prev
        ? { ...prev, scenes: prev.scenes.map(s => (s.scene === sceneNum ? newScene : s)) }
        : prev);
      getAiStatus().then(r => { if (r.success && r.data) setAiStatus(r.data); });
    } catch (e: unknown) {
      // Pembatalan oleh user bukan kegagalan.
      if (e instanceof DOMException && e.name === 'AbortError') { /* diam */ }
      else setError(e instanceof Error ? e.message : `Gagal regenerate scene ${sceneNum}`);
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
      const { scenes, foto_urls, karakter, metadata } = generatedResult;
      const platform = PLATFORM_OPTIONS.find(p => p.value === metadata.platform);
      const musik = MUSIK_OPTIONS.find(m => m.value === metadata.musik_value);
      const musikLabel = musik?.label ?? metadata.musik_value;
      const kode = (metadata.kode_listing ?? 'SBP').replace(/[^a-zA-Z0-9]/g, '-');

      for (const scene of scenes) {
        const sceneData = {
          scene: scene.scene,
          total_scene: scenes.length,
          properti: metadata.judul_properti,
          kode_listing: metadata.kode_listing,
          platform: platform?.label ?? metadata.platform,
          rasio: platform?.rasio ?? null,
          // Durasi scene INI, bukan default platform. Sejak durasi per scene
          // dihormati backend, memakai platform?.durasi membuat ZIP menyebut
          // "8 detik" untuk prompt yang disusun untuk 15 detik.
          durasi_detik: sceneDurations[scene.scene - 1] ?? platform?.durasi ?? null,
          ai_tool: metadata.ai_tool,
          bahasa: metadata.bahasa,
          musik: musikLabel,
          foto_file: `scene${scene.scene}_foto.webp`,
          foto_label: scene.foto_label ?? null,
          foto_deskripsi: scene.foto_deskripsi ?? null,
          karakter_file: namaFileKarakter(karakter.nama),
          kamera: scene.kamera,
          prompt: scene.prompt,
          // Untuk Veo/Flow, dialog sudah TERTANAM di dalam 'prompt' (di dalam tanda
          // kutip) — 'dialog_karakter' tinggal jadi rujukan naskah untuk editor.
          dialog_karakter: scene.dialog_karakter,
          ...(scene.negative_prompt ? { negative_prompt: scene.negative_prompt } : {}),
          ...(scene.max_clip_sec ? { max_clip_sec: scene.max_clip_sec } : {}),
          // sequences[] (Fase 6) — beat bertimecode untuk scene >6s pada tool audio-native.
          // Sebelumnya dibuang total dari ZIP walau diminta ke AI (audit 2026-07-28).
          ...(Array.isArray(scene.sequences) && scene.sequences.length > 0 ? { sequences: scene.sequences } : {}),
          on_screen_text: scene.on_screen_text || null,
          catatan_musik: metadata.musik_value !== 'none'
            ? 'Deskripsi audio optimal untuk Veo3/Google Flow. Kling/Wan: efek suara saja, tambahkan musik via CapCut.'
            : 'Mode tanpa musik.',
          generated_at: metadata.generated_at,
          generator: 'ViralFrame AI · salambumi.xyz',
        };
        zip.file(`scene${scene.scene}.txt`, JSON.stringify(sceneData, null, 2));
      }

      // Foto per scene diambil lewat foto_urls[scene.scene - 1] (BUKAN index loop
      // terpisah) — foto_urls[] backend selalu terurut scene 1..N (ai-generate.js
      // men-sort fotoAssignments by scene sebelum kirim), jadi ini satu-satunya
      // sumber kebenaran yang taut ke nama file `scene${scene.scene}_foto.webp`
      // yang sama persis dengan yang ditulis ke sceneN.txt di atas. Gagal fetch
      // TIDAK lagi ditelan diam-diam — dulu ZIP bisa "sukses" tanpa foto padahal
      // sceneN.txt tetap menyebut nama filenya (audit 2026-07-28).
      const missingFoto: number[] = [];
      for (const scene of scenes) {
        const url = foto_urls[scene.scene - 1];
        if (!url) { missingFoto.push(scene.scene); continue; }
        const res = await fetch(`/api/admin/media?key=${encodeURIComponent(url)}`, { credentials: 'include' });
        if (!res.ok) { missingFoto.push(scene.scene); continue; }
        zip.file(`scene${scene.scene}_foto.webp`, await res.blob());
      }
      if (missingFoto.length > 0) {
        throw new Error(`Gagal mengambil foto untuk scene ${missingFoto.join(', ')} — ZIP dibatalkan agar tidak mengunduh paket yang tidak lengkap.`);
      }

      if (karakter.foto_url) {
        try {
          const res = await fetch(`/api/admin/media?key=${encodeURIComponent(karakter.foto_url)}`, { credentials: 'include' });
          if (res.ok) zip.file(namaFileKarakter(karakter.nama), await res.blob());
        } catch { /* skip */ }
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
        ...scenes.map(s => `  scene${s.scene}.txt  — Prompt + metadata scene ${s.scene}`),
        ...scenes.map((_, i) => `  scene${i + 1}_foto.webp — Foto properti untuk scene ${i + 1}`),
        `  ${namaFileKarakter(karakter.nama)} — Foto karakter`,
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
                <span className="text-xs text-[#64748B]">Jumlah Scene</span>
                <span className="text-sm font-medium text-[#0F172A]">{jumlahScene} scene</span>
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
                <span className="text-xs text-[#64748B] block mb-1.5">Foto per Scene</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {Array.from({ length: jumlahScene }, (_, i) => i + 1).map(n => {
                    const sp = scenePhotos[n];
                    const labelText = sp ? (FOTO_LABEL_OPTIONS.find(o => o.value === sp.label)?.label ?? sp.label) : null;
                    return (
                      <span key={n} className={`text-xs px-2 py-1 rounded-lg ${sp ? 'bg-[#F0F7FF] text-[#1565C0]' : 'bg-amber-50 text-amber-600'}`}>
                        Scene {n}: {sp ? labelText : '⚠️ kosong'}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => onEditStep(1)} className="text-xs font-medium text-[#1565C0] hover:underline">Edit Step 1 (Foto)</button>
              <button type="button" onClick={() => onEditStep(2)} className="text-xs font-medium text-[#1565C0] hover:underline">Edit Step 2 (Karakter)</button>
              <button type="button" onClick={() => onEditStep(3)} className="text-xs font-medium text-[#1565C0] hover:underline">Edit Step 3 (Parameter)</button>
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
              ⚠️ Lengkapi {!selectedKarakter && 'karakter (Step 2)'}{!selectedKarakter && !allScenesHavePhoto && ' dan '}{!allScenesHavePhoto && `foto (Step 1 — scene ${missingScenes.join(', ')})`} terlebih dahulu.
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
            <p className="text-sm font-semibold text-emerald-600">✅ {generatedResult.scenes.length} prompt scene berhasil dibuat untuk {propertyTitle}!</p>
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
            {generatedResult.scenes.map(s => (
              <div key={s.scene} className={`p-3 border rounded-xl bg-[#F8FAFC] transition-colors ${regenScene === s.scene ? 'border-[#1565C0]/40' : 'border-gray-100'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-6 h-6 rounded-full bg-[#1565C0] text-white text-xs font-bold flex items-center justify-center">{s.scene}</span>
                  <span className="text-xs font-semibold text-[#64748B] flex-1">{s.kamera}</span>
                  <button
                    onClick={() => handleRegenerateScene(s.scene)}
                    disabled={regenScene != null}
                    title={`Generate ulang scene ${s.scene} dengan variasi baru (scene lain tidak berubah)`}
                    className="flex-shrink-0 text-[11px] font-semibold text-amber-600 flex items-center gap-1 disabled:opacity-40">
                    {regenScene === s.scene
                      ? <><Loader2 size={12} className="animate-spin" /> Membuat ulang…</>
                      : <><RefreshCw size={12} /> Regenerate</>}
                  </button>
                  <button
                    onClick={() => { navigator.clipboard?.writeText(JSON.stringify(s, null, 2)).then(() => { setCopiedScene(s.scene); setTimeout(() => setCopiedScene(c => (c === s.scene ? null : c)), 1500); }).catch(() => {}); }}
                    className="flex-shrink-0 text-[11px] font-semibold text-[#1565C0] flex items-center gap-1">
                    {copiedScene === s.scene ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy JSON</>}
                  </button>
                </div>
                <p className="text-xs text-[#0F172A] leading-relaxed">{s.prompt.slice(0, 200)}{s.prompt.length > 200 ? '…' : ''}</p>
                <p className="text-xs text-[#1565C0] mt-1.5 italic">"{s.dialog_karakter}"</p>
                {s.on_screen_text && (
                  <p className="text-xs text-[#7C3AED] mt-1 flex items-center gap-1">
                    <span className="font-semibold">Teks on-screen:</span> {s.on_screen_text}
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
          <p className="text-xs text-[#94A3B8] text-center">ZIP berisi scene1.txt…scene{generatedResult.scenes.length}.txt + foto + karakter + README</p>
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

// ── Content Library (Tahap 3): video hasil generate tersimpan di R2 ──
interface VideoItem { id: number; r2_key: string; label: string | null; gaya: string | null; rasio: string | null; duration_sec: number | null; size_bytes: number | null; created_at: string; post_url: string | null; views: number | null; likes: number | null }
interface AnalyticsRow { gaya: string; jumlah: number; avg_views: number; avg_likes: number }
function VideoLibrary({ propertyId }: { propertyId: number }) {
  const [items, setItems] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([]);
  const [edits, setEdits] = useState<Record<number, { post_url: string; views: string; likes: string }>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const r = await fetch(`/api/admin/viralframe/videos?property_id=${propertyId}`, { credentials: 'include' });
      const j = await bacaJson(r);
      if (j.success) {
        const list: VideoItem[] = j.data?.items ?? [];
        setItems(list);
        setEdits(Object.fromEntries(list.map(v => [v.id, { post_url: v.post_url ?? '', views: v.views != null ? String(v.views) : '', likes: v.likes != null ? String(v.likes) : '' }])));
      } else {
        // Dulu kegagalan di sini ditelan (audit 2026-07-28) — error network/server
        // membuat state "items" tetap [] dari render sebelumnya, jadi tampil
        // sebagai "Belum ada video" yang tidak bisa dibedakan dari benar-benar kosong.
        setLoadError(j.error ?? 'Gagal memuat library video');
      }
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Gagal memuat library video');
    } finally { setLoading(false); }
    try { const a = await fetch('/api/admin/viralframe/analytics', { credentials: 'include' }); const aj = await bacaJson(a); if (aj.success) setAnalytics(aj.data?.items ?? []); } catch { /* noop — analitik best-effort, tidak wajib untuk library berfungsi */ }
  }, [propertyId]);
  useEffect(() => { load(); }, [load]);

  const del = async (id: number) => {
    if (!window.confirm('Hapus video ini dari Library?')) return;
    try {
      const r = await fetch(`/api/admin/viralframe/videos/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!r.ok) { const j = await bacaJson(r); alert(`Gagal menghapus: ${j.error ?? `HTTP ${r.status}`}`); }
    } catch (err: unknown) { alert(`Gagal menghapus: ${err instanceof Error ? err.message : 'Error'}`); }
    load();
  };
  const saveMetrics = async (id: number) => {
    const e = edits[id]; if (!e) return;
    setSavingId(id);
    try {
      await fetch(`/api/admin/viralframe/videos/${id}`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_url: e.post_url, views: parseInt(e.views, 10) || 0, likes: parseInt(e.likes, 10) || 0 }),
      });
    } catch { /* noop */ } finally { setSavingId(null); load(); }
  };
  const setEdit = (id: number, k: 'post_url' | 'views' | 'likes', val: string) =>
    setEdits(prev => ({ ...prev, [id]: { ...(prev[id] ?? { post_url: '', views: '', likes: '' }), [k]: val } }));
  const mediaUrl = (key: string) => `/api/admin/media?key=${encodeURIComponent(key)}`;

  if (loading) return <div className="py-8 text-center text-sm text-[#94A3B8]"><Loader2 size={18} className="animate-spin mx-auto mb-1" /> Memuat library…</div>;
  if (loadError) return (
    <div className="text-center py-10 border border-dashed border-red-200 rounded-2xl">
      <p className="text-sm text-red-600 mb-2">{loadError}</p>
      <button onClick={load} className="text-xs font-semibold text-[#1565C0] underline">Coba lagi</button>
    </div>
  );
  if (items.length === 0) return (
    <div className="text-center py-10 border border-dashed border-gray-200 rounded-2xl">
      <Film size={26} className="text-gray-300 mx-auto mb-2" />
      <p className="text-sm text-[#64748B]">Belum ada video tersimpan. Generate video di tab Video VO — hasilnya otomatis tersimpan di sini.</p>
    </div>
  );
  return (
    <div className="space-y-4">
      {/* Tahap 6: ringkasan analitik gaya "pemenang" */}
      {analytics.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="text-sm font-semibold text-[#0F172A] mb-2">📊 Performa per Gaya (dari metrik yang diisi)</div>
          <div className="space-y-1">
            {analytics.map((a, i) => (
              <div key={a.gaya} className="flex items-center justify-between text-xs">
                <span className={`font-medium ${i === 0 ? 'text-emerald-600' : 'text-[#64748B]'}`}>{i === 0 ? '🏆 ' : ''}{a.gaya}</span>
                <span className="text-[#94A3B8]">rata-rata {a.avg_views.toLocaleString('id-ID')} views · {a.avg_likes.toLocaleString('id-ID')} likes · {a.jumlah} video</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map(v => {
          const e = edits[v.id] ?? { post_url: '', views: '', likes: '' };
          return (
            <div key={v.id} className="border border-gray-100 rounded-2xl overflow-hidden bg-white">
              <video src={mediaUrl(v.r2_key)} controls preload="none" className="w-full bg-black aspect-video" />
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[#0F172A] truncate">{v.label ?? 'Video'}</div>
                    <div className="text-[11px] text-[#94A3B8]">
                      {v.gaya ?? '—'} · {v.rasio ?? '—'} · {v.size_bytes ? `${(v.size_bytes / 1024 / 1024).toFixed(1)}MB` : ''} · {new Date(v.created_at).toLocaleDateString('id-ID')}
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <a href={mediaUrl(v.r2_key)} download className="p-1.5 rounded-lg text-[#1565C0] hover:bg-[#F0F7FF]" title="Download"><Download size={15} /></a>
                    <button onClick={() => del(v.id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50" title="Hapus"><X size={15} /></button>
                  </div>
                </div>
                {/* Tahap 6: input metrik A/B */}
                <div className="pt-2 border-t border-gray-50 space-y-1.5">
                  <input value={e.post_url} onChange={ev => setEdit(v.id, 'post_url', ev.target.value)} placeholder="URL postingan (TikTok/IG/YT)"
                    className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-[#1565C0]" />
                  <div className="flex items-center gap-2">
                    <input value={e.views} onChange={ev => setEdit(v.id, 'views', ev.target.value)} placeholder="Views" inputMode="numeric"
                      className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-[#1565C0]" />
                    <input value={e.likes} onChange={ev => setEdit(v.id, 'likes', ev.target.value)} placeholder="Likes" inputMode="numeric"
                      className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-[#1565C0]" />
                    <button onClick={() => saveMetrics(v.id)} disabled={savingId === v.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#1565C0] hover:bg-[#1565C0]/90 disabled:opacity-50 flex-shrink-0">
                      {savingId === v.id ? '…' : 'Simpan'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
const VideoLibraryMemo = memo(VideoLibrary);

// ── Upload Hasil (Tahap 4): upload video jadi dari AI eksternal ke Cloudinary, tertaut karakter/agent ──
interface CharacterOption { id: number; nama: string; foto_url: string }
interface CloudinaryUploadResult {
  public_id: string; secure_url: string; resource_type?: string; duration?: number; bytes?: number; format?: string;
  width?: number; height?: number;
  error?: { message: string };
}
function UploadAgentVideo({ propertyId, kodeListing, defaultCharacterId, platform, registerInstruction }: {
  propertyId: number; kodeListing: string; defaultCharacterId: number | null; platform: string; registerInstruction: string;
}) {
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
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
      await ffmpeg.exec([
        '-i', 'video.mp4', '-stream_loop', '-1', '-i', 'backsound.mp3',
        '-filter_complex', `[1:a]volume=${(volumePct / 100).toFixed(2)}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]`,
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

  useEffect(() => {
    fetch('/api/admin/viralframe/characters', { credentials: 'include' })
      .then(r => bacaJson(r))
      .then(j => { if (j.success) setCharacters(j.data?.items ?? []); })
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

  const reset = () => {
    setFile(null); setCaption(''); setHashtags(''); setCapVariasi([]); setProgress(0); setError(''); setSuccess(false);
    setBacksoundId(null); setBacksoundItem(null); setMergeError(''); invalidateMerged();
    if (fileRef.current) fileRef.current.value = '';
  };

  const upload = async () => {
    if (!file) { setError('Pilih file video dulu'); return; }
    if (!characterId) { setError('Pilih karakter/agent dulu'); return; }
    setUploading(true); setError(''); setSuccess(false); setProgress(0);
    try {
      const signRes = await fetch('/api/admin/viralframe/cloudinary-sign', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId }),
      });
      const signJson = await bacaJson(signRes);
      if (!signJson.success) throw new Error(signJson.error ?? 'Gagal menyiapkan upload');
      const { cloudName, apiKey, timestamp, folder, signature } = signJson.data;

      // Backsound (opsional) sudah "dipanggang" jadi mergedBlob SEBELUM upload ini —
      // Cloudinary/Konten Agent menerima file final, tidak pernah tahu prosesnya.
      const uploadFile = mergedBlob ? new File([mergedBlob], file.name, { type: 'video/mp4' }) : file;
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
          resource_type: cloudinaryResult.resource_type ?? 'video', duration_sec: cloudinaryResult.duration ?? null,
          bytes: cloudinaryResult.bytes ?? null, format: cloudinaryResult.format ?? null,
          width: cloudinaryResult.width ?? null, height: cloudinaryResult.height ?? null,
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
          onChange={e => { setFile(e.target.files?.[0] ?? null); invalidateMerged(); }}
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
                onSelect={(id, item) => { setBacksoundId(id); setBacksoundItem(item); invalidateMerged(); }}
                volumePct={volumePct}
                onVolumeChange={v => { setVolumePct(v); invalidateMerged(); }}
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
                {(mergedUrl ?? localPreviewUrl) ? (
                  <video controls src={mergedUrl ?? localPreviewUrl ?? undefined} className="absolute inset-0 w-full h-full object-contain" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-[#475569] gap-1.5">
                    <Film size={22} />
                    <span className="text-[10px]">Preview video</span>
                  </div>
                )}
              </div>
              {mergedUrl ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
                  <Check size={10} /> Backsound diterapkan — versi ini yang akan ter-upload
                </span>
              ) : (
                <span className="inline-flex items-center text-[10px] font-medium text-[#94A3B8] bg-gray-50 rounded-full px-2 py-0.5">
                  Video asli (belum ada backsound)
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-[#0F172A] mb-1">Karakter / Agent</label>
        <select value={characterId} onChange={e => setCharacterId(e.target.value ? parseInt(e.target.value, 10) : '')}
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-[#1565C0]">
          <option value="">— Pilih karakter —</option>
          {characters.map(c => <option key={c.id} value={c.id}>{c.nama}</option>)}
        </select>
        {characters.length === 0 && <p className="text-[11px] text-[#94A3B8] mt-1">Belum ada karakter. Buat dulu di Step 2 — Pilih Karakter.</p>}
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
const VideoVOTabMemo = memo(VideoVOTab);
const AIGenerateTabMemo = memo(AIGenerateTab);

export default function AdminViralFrameWorkspacePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isVideoVOMode = searchParams.get('mode') === 'video-vo';
  const isAIGenerateMode = searchParams.get('mode') === 'ai-generate';
  const isYoutubeLongMode = searchParams.get('mode') === 'youtube-long';

  const [prop, setProp] = useState<PropertyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  const [showErrors, setShowErrors] = useState(false);
  const [activePhotoScene, setActivePhotoScene] = useState(1);

  const [s1, setS1] = useState<Step1State>({
    sceneCount: 4,
    durationMode: 'uniform',
    uniformDuration: 10,
    manualDurations: [10, 10, 10, 10],
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
  const [scenes, setScenes] = useState<SceneAssign[]>(
    Array.from({ length: 4 }, () => ({ photoId: null, label: '' }))
  );
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

  // Terapkan konfigurasi tersimpan ({s1,scenes,s3}) ke state — merge defensif.
  const applyConfig = useCallback((cfg: { s1?: Partial<Step1State>; scenes?: SceneAssign[]; s3?: Partial<Step3State> } | null) => {
    if (!cfg) return;
    if (cfg.s1)  setS1(prev => ({ ...prev, ...cfg.s1 }));
    if (Array.isArray(cfg.scenes)) setScenes(cfg.scenes);
    if (cfg.s3)  setS3(prev => ({ ...prev, ...cfg.s3 }));
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
  const autosaveSrc = useMemo(() => ({ s1, scenes, s3 }), [s1, scenes, s3]);
  const debouncedAutosave = useDebouncedValue(autosaveSrc, 800);
  useEffect(() => {
    if (!draftKey || !hydrated) return;
    try { localStorage.setItem(draftKey, JSON.stringify({ ...debouncedAutosave, ts: Date.now() })); } catch { /* ignore */ }
  }, [draftKey, hydrated, debouncedAutosave]);

  // Riwayat generate (D1) per properti.
  interface GenItem { id: number; params_json: string | null; master_prompt: string | null; result_json: string | null; created_at: string }
  const [history, setHistory] = useState<GenItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
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
      durationMode: s1.durationMode, uniformDuration: s1.uniformDuration,
      cutawayExcluded: s1.cutawayExcluded,
    };
    try { await fetch('/api/admin/viralframe/presets', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), params }) }); } catch { /* noop */ }
    loadPresets();
  };
  const applyPreset = (name: string) => {
    const p = presets.find(x => x.name === name);
    if (!p) return;
    // Buang field struktur dari preset (lama maupun baru) — jangan sentuh scenes[],
    // sceneCount, parts, atau manualDurations milik Step 1.
    const { sceneCount: _sc, parts: _pt, manualDurations: _md, ...visualParams } = p.params;
    setS1(prev => ({ ...prev, ...visualParams }));
  };

  // ─── Jalur C: derivasi props AIGenerateTab dari state Step 1–3 (bukan form independen lagi) ──
  const platformForAI = s1.platforms[0] ?? 'tiktok';
  const scenePhotosForAI = useMemo(() => {
    const map: Record<number, ScenePhoto> = {};
    if (!prop) return map;
    const imgById = new Map(prop.images.map(im => [im.id, im]));
    scenes.forEach((sc, i) => {
      if (sc.photoId == null) return;
      if (!sc.label) return; // belum dilabeli — jangan diam-diam fallback ke 'lainnya', treat sebagai belum lengkap
      const img = imgById.get(sc.photoId);
      if (!img) return;
      map[i + 1] = { foto_url: img.url_webp, label: PHOTO_LABEL_TO_FOTO_LABEL[sc.label] ?? 'lainnya' };
    });
    return map;
  }, [scenes, prop]);
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
  const sceneRolesForAI = useMemo(() => {
    const map: Record<number, 'Hook' | 'Body' | 'CTA'> = {};
    for (let i = 0; i < s1.sceneCount; i++) map[i + 1] = sceneRoleFromParts(i, s1.sceneCount, s1.parts);
    return map;
  }, [s1.sceneCount, s1.parts]);

  // Step 4 — compile + save history
  const [copied, setCopied] = useState(false);
  const [generationId, setGenerationId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const savedPromptRef = useRef<string>('');

  // Step 4 — Tab Paste & Validate (Fase V4b)
  const [step4Tab, setStep4Tab] = useState<'prompt' | 'validate' | 'video_vo' | 'ai_generate' | 'library' | 'upload'>('prompt');
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

  // Pilihan dari list page (?mode=video-vo) — tetap mulai dari Step 1, tapi
  // begitu user sampai di Step 4 secara natural, tab Video VO sudah aktif duluan.
  useEffect(() => {
    if (isVideoVOMode) {
      setStep4Tab('video_vo');
    }
  }, [isVideoVOMode]);

  // Pilihan dari list page (?mode=ai-generate) — tetap mulai dari Step 1, tapi
  // begitu user sampai di Step 4 secara natural, tab AI Generate sudah aktif duluan.
  useEffect(() => {
    if (isAIGenerateMode) {
      setStep4Tab('ai_generate');
    }
  }, [isAIGenerateMode]);

  // Ubah jumlah scene → resize manualDurations & scenes (pertahankan nilai lama).
  // cutawayExcluded: bila sebelumnya persis default "hanya scene terakhir" (CTA),
  // geser mengikuti scene terakhir yang baru; selain itu cukup buang nomor scene
  // yang sudah tidak ada lagi (di atas n).
  const setSceneCount = useCallback((raw: number) => {
    const n = Math.max(2, Math.min(12, raw || 0));
    setS1(prev => {
      const wasDefaultCtaOnly = prev.cutawayExcluded.length === 1 && prev.cutawayExcluded[0] === prev.sceneCount;
      const cutawayExcluded = wasDefaultCtaOnly ? [n] : prev.cutawayExcluded.filter(x => x <= n);
      // Jumlah scene berubah → rancangan Part lama (kalau ada) kemungkinan besar
      // sum-nya sudah tidak cocok lagi. Dari pada diam-diam fallback ke role posisi
      // (membingungkan user yang sudah rancang Part), hapus saja — user rancang ulang.
      const partsSum = (prev.parts ?? []).reduce((s, p) => s + p.sceneCount, 0);
      const parts = prev.parts && partsSum === n ? prev.parts : undefined;
      return {
        ...prev,
        sceneCount: n,
        manualDurations: resize(prev.manualDurations, n, () => prev.uniformDuration || 6),
        cutawayExcluded,
        parts,
      };
    });
    setScenes(prev => resize(prev, n, () => ({ photoId: null, label: '' })));
  }, []);

  const update1 = <K extends keyof Step1State>(key: K, val: Step1State[K]) =>
    setS1(prev => ({ ...prev, [key]: val }));

  // ─── Part designer (Fase 6) ─────────────────────────────────────────────────
  const addPart = useCallback(() => {
    setS1(prev => {
      // Klik pertama (belum ada Part sama sekali): seed 3 part yang MENCERMINKAN
      // distribusi role legacy (Hook scene pertama, CTA scene terakhir, sisanya
      // Body) — supaya mengaktifkan fitur Part TIDAK diam-diam mengubah role
      // scene yang sudah ada jadi "Body" semua (footgun kalau langsung 1 part).
      if (!prev.parts || prev.parts.length === 0) {
        const n = prev.sceneCount;
        const bodyCount = Math.max(0, n - 2);
        const seeded: PartDef[] = n >= 2
          ? [
              { role: 'Hook', sceneCount: 1 },
              ...(bodyCount > 0 ? [{ role: 'Body' as const, sceneCount: bodyCount }] : []),
              { role: 'CTA', sceneCount: 1 },
            ]
          : [{ role: 'Body', sceneCount: n }];
        return { ...prev, parts: seeded };
      }
      const used = prev.parts.reduce((s, p) => s + p.sceneCount, 0);
      const sisa = Math.max(1, prev.sceneCount - used);
      return { ...prev, parts: [...prev.parts, { role: 'Body', sceneCount: sisa }] };
    });
  }, []);
  const removePart = useCallback((idx: number) => {
    setS1(prev => ({ ...prev, parts: (prev.parts ?? []).filter((_, i) => i !== idx) }));
  }, []);
  const updatePart = useCallback((idx: number, patch: Partial<PartDef>) => {
    setS1(prev => ({
      ...prev,
      parts: (prev.parts ?? []).map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }));
  }, []);

  // ─── AI Rancang Storyboard ──────────────────────────────────────────────────
  // Sekali klik: AI bernalar dari label_ruangan yang sudah tersimpan (TANPA vision
  // AI, murni teks) untuk mengisi s1.parts DAN scenes[] sekaligus — meniru pola
  // applyArchetype() (AI mengisi default, user tetap bisa timpa manual sesudahnya).
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState('');
  const suggestStoryboard = useCallback(async () => {
    if (!prop) return;
    setSuggestLoading(true); setSuggestError('');
    try {
      const r = await fetch('/api/admin/viralframe/suggest-storyboard', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: prop.id, scene_count: s1.sceneCount, archetype: s1.archetype, register: s1.register }),
      });
      const data = await readNdjsonFinal<{
        parts: PartDef[];
        scene_photo_order: { scene: number; label: string; photo_id: number; url_webp: string }[];
      }>(r);
      setS1(prev => ({ ...prev, parts: data.parts }));
      setScenes(data.scene_photo_order.map(x => ({ photoId: x.photo_id, label: x.label })));
    } catch (e: unknown) {
      setSuggestError(e instanceof Error ? e.message : 'Gagal rancang storyboard');
    } finally {
      setSuggestLoading(false);
    }
  }, [prop, s1.sceneCount, s1.archetype, s1.register]);

  // Pilih arketipe → prefill visualStyle/tone/register/cutaway (parameter Step 3 saja).
  // Nilai tetap bisa di-override manual setelahnya (memilih 'custom' tidak mereset).
  // SENGAJA tidak menyentuh s3: sejak reorder wizard, karakter & ekspresi dipilih di
  // Step 2 SEBELUM arketipe — menimpanya di sini berarti membuang pilihan user tanpa
  // peringatan. Varian B di Style Pair A/B tetap memakai default arketipe (itu
  // derivasi compile s3B, bukan state user).
  // Arketipe hybrid (allowMultiShotPerScene): default scene terakhir (CTA) DIKECUALIKAN
  // dari cutaway — jadi talking-head/selfie murni sebagai penutup. User bisa override
  // per scene lewat toggle "Per-Scene: Cutaway B-Roll" di bawah picker arketipe.
  const applyArchetype = (id: string) => {
    const arc = findArchetype(id);
    if (!arc) { setS1(prev => ({ ...prev, archetype: ARCHETYPE_CUSTOM_ID, cutawayExcluded: [] })); return; }
    setS1(prev => ({
      ...prev,
      archetype: id,
      visualStyle: arc.defaults.visualStyle,
      tone: arc.defaults.tone,
      register: arc.defaults.register ?? prev.register,
      cutawayExcluded: arc.allowMultiShotPerScene ? [prev.sceneCount] : [],
    }));
  };

  // Toggle satu scene masuk/keluar dari daftar pengecualian cutaway.
  const toggleCutawayExcluded = (sceneNum: number) => {
    setS1(prev => {
      const has = prev.cutawayExcluded.includes(sceneNum);
      return { ...prev, cutawayExcluded: has ? prev.cutawayExcluded.filter(x => x !== sceneNum) : [...prev.cutawayExcluded, sceneNum].sort((a, b) => a - b) };
    });
  };

  const togglePlatform = (value: string) => {
    setS1(prev => {
      const has = prev.platforms.includes(value);
      const platforms = has ? prev.platforms.filter(p => p !== value) : [...prev.platforms, value];
      return { ...prev, platforms };
    });
  };

  const setManualDuration = (idx: number, val: number) => {
    setS1(prev => {
      const md = [...prev.manualDurations];
      md[idx] = val;
      return { ...prev, manualDurations: md };
    });
  };

  const setScene = (idx: number, patch: Partial<SceneAssign>) =>
    setScenes(prev => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  // Simpan label ruangan foto langsung dari Step 1 — persist ke property_images.label_ruangan
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
  // Urutan wizard: 1 Foto per Scene → 2 Karakter → 3 Parameter Video → 4 Generate.
  const fotoErrors = useMemo(() => {
    const e: string[] = [];
    if (s1.sceneCount < 2 || s1.sceneCount > 12) e.push('Jumlah scene harus 2–12.');
    scenes.slice(0, s1.sceneCount).forEach((sc, i) => {
      if (sc.photoId == null) e.push(`Scene ${i + 1}: belum memilih foto.`);
      if (!sc.label) e.push(`Scene ${i + 1}: belum memilih label foto.`);
    });
    return e;
  }, [scenes, s1.sceneCount]);

  const karakterErrors = useMemo(() => {
    const e: string[] = [];
    if (s3.useCharacter && s3.characterId == null) {
      e.push('Pilih atau upload karakter terlebih dahulu.');
    }
    return e;
  }, [s3]);

  const paramErrors = useMemo(() => {
    const e: string[] = [];
    if (s1.platforms.length === 0) e.push('Pilih minimal 1 platform distribusi.');
    // Rentang 2–30 detik = rentang yang benar-benar didukung getLipsync().
    // Di luar itu nilainya di-clamp diam-diam, jadi lebih baik ditolak terang-terangan.
    const durasiSah = (d: number) => Number.isFinite(d) && d >= 2 && d <= 30;
    if (s1.durationMode === 'uniform') {
      if (!durasiSah(s1.uniformDuration)) e.push('Durasi per scene harus antara 2–30 detik.');
    } else {
      const bad = s1.manualDurations.slice(0, s1.sceneCount).some(d => !durasiSah(d));
      if (bad) e.push('Setiap durasi scene harus antara 2–30 detik.');
    }
    if (s1.ctaType === 'comment_keyword' && !s1.ctaKeyword.trim()) {
      e.push('Keyword komentar wajib diisi untuk CTA "Komen [KEYWORD]".');
    }
    return e;
  }, [s1]);

  const errorsFor = (st: number) => (st === 1 ? fotoErrors : st === 2 ? karakterErrors : st === 3 ? paramErrors : []);

  const goNext = () => {
    const errs = errorsFor(step);
    if (errs.length > 0) { setShowErrors(true); return; }
    setShowErrors(false);
    setStep(s => Math.min(4, s + 1));
  };
  const goBack = () => { setShowErrors(false); setStep(s => Math.max(1, s - 1)); };

  // ─── Step 4: compile Master Prompt ──
  // #1: hanya kompilasi saat benar-benar berada di Step 4, dan pakai input yang
  // di-debounce 300ms — supaya mengetik/memilih di Step 1-3 tidak memicu build
  // string besar tiap ketukan (penyebab utama lag).
  const onStep4 = step === 4;
  const compileSrc = useMemo(() => ({ s1, scenes, s3 }), [s1, scenes, s3]);
  const debouncedSrc = useDebouncedValue(compileSrc, 300);
  const masterPrompt = useMemo(
    () => (prop && onStep4 ? compileMasterPrompt(prop, debouncedSrc.s1, debouncedSrc.scenes, debouncedSrc.s3) : ''),
    [prop, onStep4, debouncedSrc],
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
    const { s1: ds1, scenes: dscenes, s3: ds3 } = debouncedSrc;
    // cutawayExcluded ikut aturan applyArchetype: B hybrid mewarisi pilihan A bila
    // A juga hybrid; kalau tidak, pakai default hybrid (scene terakhir dikecualikan).
    const aIsHybrid = findArchetype(ds1.archetype)?.allowMultiShotPerScene === true;
    const cutawayB = arcB.allowMultiShotPerScene ? (aIsHybrid ? ds1.cutawayExcluded : [ds1.sceneCount]) : [];
    const s1B: Step1State = { ...ds1, archetype: abVariant, visualStyle: arcB.defaults.visualStyle, tone: arcB.defaults.tone, cutawayExcluded: cutawayB };
    const s3B: Step3State = { ...ds3, useCharacter: arcB.defaults.useCharacter, expression: arcB.defaults.expression };
    return compileMasterPrompt(prop, s1B, dscenes, s3B);
  }, [prop, abVariant, onStep4, debouncedSrc]);

  // Simpan riwayat otomatis saat Step 4 tampil; record baru bila prompt berubah.
  useEffect(() => {
    if (step !== 4 || !prop || !masterPrompt) return;
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
        params_json: JSON.stringify({ s1, scenes, s3, rulebook_version: RULEBOOK_VERSION }),
        master_prompt: masterPrompt,
      }),
    })
      .then(r => bacaJson(r))
      .then(j => { if (j?.data?.id) setGenerationId(j.data.id); })
      .catch(() => {})
      .finally(() => setSaving(false));
    // s1/scenes/s3 sengaja tidak di deps — perubahannya tercermin via masterPrompt
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, masterPrompt, prop]);

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

  // ─── Step 4b: durasi per scene (untuk validasi & scene cards) ─────────────
  const durations = useMemo(
    () => (s1.durationMode === 'uniform'
      ? Array.from({ length: s1.sceneCount }, () => s1.uniformDuration)
      : s1.manualDurations.slice(0, s1.sceneCount)),
    [s1.durationMode, s1.sceneCount, s1.uniformDuration, s1.manualDurations],
  );

  // Reset hasil validasi bila PARAMETER (s1/scenes/s3) benar-benar berubah agar
  // tidak stale — sengaja pakai `debouncedSrc`, BUKAN `masterPrompt`. `masterPrompt`
  // sengaja di-set '' setiap kali step !== 4 (optimasi performa, lihat komentar di
  // deklarasinya), jadi dulu dependency ini membuat navigasi Step 4→3→4 TANPA
  // edit apa pun ikut menghapus JSON yang sudah dipaste+divalidasi + scene cards
  // (audit 2026-07-28). `debouncedSrc` hanya berubah referensi kalau s1/scenes/s3
  // benar-benar berubah, tidak terpengaruh navigasi step.
  useEffect(() => {
    setValResult(null); setValidData(null); setWarningsDismissed(false); setZipError('');
  }, [debouncedSrc]);

  const handleValidate = () => {
    setZipError('');
    const result = validateSceneJson(pasteRaw, {
      sceneCount: s1.sceneCount, aiTool: s1.aiTool, scenes, durations,
    });
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

  const handleDownloadZip = async () => {
    if (!validData || !prop) return;
    setZipBusy(true); setZipError('');
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const photosFolder = zip.folder('photos');

      // (a) Foto tiap scene → photos/sceneNN_label.webp (nama PERSIS dari options.ts)
      const imgById = new Map(prop.images.map(im => [im.id, im]));
      for (let i = 0; i < s1.sceneCount; i++) {
        const sc = scenes[i];
        if (!sc?.photoId) continue;
        const img = imgById.get(sc.photoId);
        if (!img) continue;
        const res = await fetch(`/api/admin/media?key=${encodeURIComponent(img.url_webp)}`, { credentials: 'include' });
        if (!res.ok) throw new Error(`Gagal unduh foto scene ${i + 1} (HTTP ${res.status})`);
        const blob = await res.blob();
        photosFolder?.file(sceneFileName(i, sc.label || ''), blob);
      }

      // (b) Foto karakter → character/character_nama.webp
      if (s3.useCharacter && s3.character?.foto_url) {
        const res = await fetch(`/api/admin/media?key=${encodeURIComponent(s3.character.foto_url)}`, { credentials: 'include' });
        if (res.ok) {
          const blob = await res.blob();
          zip.folder('character')?.file(characterFileName(s3.character.nama), blob);
        }
      }

      // (c) prompt.txt = Master Prompt
      zip.file('prompt.txt', masterPrompt);

      // (d) caption_hashtag.txt
      const pn = validData.production_notes ?? {};
      const caption = pn.caption ?? '';
      const hashtags = Array.isArray(pn.hashtags)
        ? pn.hashtags.map(h => `#${String(h).replace(/^#/, '')}`).join(' ')
        : '';
      zip.file('caption_hashtag.txt', `CAPTION:\n${caption}\n\nHASHTAGS:\n${hashtags}`);

      // (d2) subtitles.srt — timing dari narasi + durasi scene (R8)
      const srt = buildSrt(validData.scenes ?? [], durations);
      if (srt.trim()) zip.file('subtitles.srt', srt);

      // (d3) scenes.json — JSON hasil AI tervalidasi (ai_ready_prompt per scene ada
      // di sini), agar bundle mandiri: user tidak perlu balik ke web untuk copy prompt.
      zip.file('scenes.json', JSON.stringify(validData, null, 2));

      // (e) generate + download
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

      {/* Tahap 4: YouTube Long 1-klik menggantikan wizard */}
      {isYoutubeLongMode && prop && (
        <YouTubeLongViewMemo propertyId={prop.id} propertyTitle={prop.title} photos={prop.images} />
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
                        <button onClick={() => { try { applyConfig(JSON.parse(h.params_json!)); setStep(1); setShowHistory(false); } catch { /* ignore */ } }}
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

      {/* Step indicator */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <StepIndicator current={step} />
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

      {/* ─── STEP 3 — Parameter Video ─── */}
      {step === 3 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-display font-bold text-[#0F172A]">Step 3 — Parameter Video</h2>
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
            </div>
          </div>

          {/* (0) Arketipe / Gaya Video — prefill parameter granular secara koheren */}
          <Field label="Gaya Video (Arketipe)" hint="Pilih satu gaya → Gaya Visual, Tone, & koreografi kamera terisi otomatis (tetap bisa diubah). Pilih Kustom untuk atur manual.">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ARCHETYPES.map(a => {
                const active = s1.archetype === a.id;
                return (
                  <button key={a.id} type="button" onClick={() => applyArchetype(a.id)}
                    className={`text-left p-3 rounded-xl border transition-colors ${
                      active ? 'bg-[#EFF6FF] border-[#1565C0] ring-1 ring-[#1565C0]/30' : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}>
                    <div className="text-lg leading-none mb-1">{a.emoji}</div>
                    <div className={`text-sm font-semibold ${active ? 'text-[#1565C0]' : 'text-[#0F172A]'}`}>{a.label}</div>
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

          {/* Per-scene cutaway override — hanya muncul untuk arketipe hybrid
              (agent_broll_hybrid/selfie_luxury_hybrid). Default: scene terakhir
              (CTA) dikecualikan dari cutaway (talking-head/selfie murni sebagai
              penutup); user bisa toggle scene mana pun secara manual. */}
          {(() => {
            const arc = findArchetype(s1.archetype);
            if (!arc?.allowMultiShotPerScene) return null;
            return (
              <Field label="Per-Scene: Cutaway B-Roll" hint='Nonaktifkan cutaway di scene tertentu (mis. CTA/penutup) — scene itu jadi talking-head/selfie murni tanpa disela b-roll.'>
                <div className="space-y-1.5">
                  {Array.from({ length: s1.sceneCount }, (_, i) => i + 1).map(sceneNum => {
                    const role = sceneRoleFromParts(sceneNum - 1, s1.sceneCount, s1.parts);
                    const excluded = s1.cutawayExcluded.includes(sceneNum);
                    return (
                      <div key={sceneNum} className="flex items-center justify-between px-3 py-2 border border-gray-100 rounded-xl">
                        <span className="text-sm text-[#0F172A]">Scene {sceneNum} <span className="text-xs text-[#94A3B8]">({role})</span></span>
                        <button type="button" onClick={() => toggleCutawayExcluded(sceneNum)}
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

          {/* Jumlah Scene, Rancang Part, dan AI Rancang Storyboard pindah ke
              Step 1 (Pilih Foto per Scene) — struktur scene dirancang bersama foto. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Mode Durasi */}
            <Field label="Mode Durasi">
              <div className="flex gap-2">
                {(['uniform', 'manual'] as const).map(m => (
                  <button key={m} type="button" onClick={() => update1('durationMode', m)}
                    className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      s1.durationMode === m
                        ? 'bg-[#1565C0] text-white border-[#1565C0]'
                        : 'bg-white text-[#64748B] border-gray-200 hover:bg-gray-50'
                    }`}>
                    {m === 'uniform' ? 'Seragam' : 'Manual per Scene'}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {/* Durasi seragam */}
          {s1.durationMode === 'uniform' && (
            <Field label="Durasi per Scene (detik)" hint="2–30 detik">
              <input type="number" min={2} max={30} value={s1.uniformDuration}
                onChange={e => update1('uniformDuration', parseInt(e.target.value, 10) || 0)}
                className={`${selectCls} sm:w-40`} />
            </Field>
          )}

          {/* Durasi manual per scene */}
          {s1.durationMode === 'manual' && (
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-[#64748B]">No. Scene</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-[#64748B]">Durasi (detik)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {Array.from({ length: s1.sceneCount }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 text-[#0F172A]">Scene {i + 1} <span className="text-[#94A3B8] text-xs">({sceneRoleFromParts(i, s1.sceneCount, s1.parts)})</span></td>
                      <td className="px-3 py-1.5">
                        {/* 2–30 detik, SAMA dengan mode seragam. Dulu 1–60 padahal
                            getLipsync() meng-clamp ke 2–30, jadi durasi 45 detik
                            diam-diam diperlakukan sebagai 30 detik tanpa peringatan. */}
                        <input type="number" min={2} max={30} value={s1.manualDurations[i] ?? 0}
                          onChange={e => setManualDuration(i, parseInt(e.target.value, 10) || 0)}
                          className="w-24 px-2 py-1 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1565C0]" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Peringatan batas klip tool (Veo/Flow = 8 detik per sekali generate).
              Sebelumnya batas ini tidak pernah disebut di mana pun, sehingga user
              bisa menyusun scene 20-30 detik yang mustahil dihasilkan sekali jalan. */}
          {(() => {
            const clipMax = getClipMaxSec(s1.aiTool);
            if (clipMax == null) return null;
            const lewat = durations
              .map((d, i) => ({ d, n: i + 1 }))
              .filter(x => x.d > clipMax);
            if (lewat.length === 0) return null;
            const toolLabel = AI_TOOLS.find(t => t.value === s1.aiTool)?.label ?? s1.aiTool;
            return (
              <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                <span aria-hidden="true">⚠️</span>
                <p>
                  <strong>{toolLabel}</strong> hanya menghasilkan <strong>{clipMax} detik</strong> per sekali generate.
                  {' '}Scene {lewat.map(x => x.n).join(', ')} melebihi itu, jadi harus disambung memakai fitur <em>Extend</em> di tool tersebut.
                  {' '}Master Prompt sudah diberi tahu soal ini, tapi lebih mulus kalau durasinya diturunkan ke ≤{clipMax} detik.
                </p>
              </div>
            );
          })()}

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
              <Select value={s1.aiTool} onChange={v => update1('aiTool', v)} opts={AI_TOOLS} />
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
          </Field>
          {s1.ctaType === 'comment_keyword' && (
            <Field label="Keyword Komentar" hint="Kata yang harus diketik penonton di kolom komentar">
              <input type="text" value={s1.ctaKeyword} maxLength={30}
                onChange={e => update1('ctaKeyword', e.target.value)}
                placeholder="cth: MINAT"
                className={`${selectCls} sm:w-60`} />
            </Field>
          )}
        </div>
      )}

      {/* ─── STEP 1 — Pilih Foto per Scene ───
          Termasuk Jumlah Scene + Rancang Part + AI Rancang Storyboard (pindahan dari
          blok parameter): struktur scene dan pengisian fotonya dirancang di satu layar. */}
      {step === 1 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-5">
          <h2 className="font-display font-bold text-[#0F172A]">Step 1 — Pilih Foto per Scene</h2>
          <p className="text-sm text-[#64748B] -mt-3">
            Tentukan jumlah scene, lalu pilih 1 foto untuk tiap scene. Foto yang sama boleh dipakai di beberapa scene.
          </p>

          <Field label="Jumlah Scene" hint="Antara 2–12 scene">
            <input type="number" min={2} max={12} value={s1.sceneCount}
              onChange={e => setSceneCount(parseInt(e.target.value, 10))}
              className={`${selectCls} sm:w-40`} />
          </Field>

          {/* Rancang Part (Fase 6, opsional) — pengelompokan naratif di atas Scene.
              Part TIDAK mengubah mekanisme Scene (tetap 1 foto = 1 generate call);
              hanya membawa role di level lebih tinggi + label naratif. Kosong = fallback
              role otomatis berdasar posisi (Hook scene pertama, CTA scene terakhir). */}
          <Field label="Rancang Part (opsional)" hint="Kelompokkan scene jadi babak naratif (Hook/Body/CTA) — kosongkan untuk perilaku otomatis berdasar posisi seperti biasa.">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button type="button" onClick={suggestStoryboard} disabled={suggestLoading}
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-[#1565C0]/30 text-[#1565C0] hover:bg-[#F0F7FF] disabled:opacity-50 disabled:cursor-not-allowed">
                  {suggestLoading ? 'Merancang…' : '🤖 AI Rancang Storyboard'}
                </button>
                <span className="text-[11px] text-[#94A3B8]">Isi Part + foto per scene otomatis dari label ruangan yang sudah tersimpan — tetap bisa diedit manual.</span>
              </div>
              {suggestError && <p className="text-xs text-red-500">{suggestError}</p>}
              {(s1.parts ?? []).map((p, idx) => (
                <div key={idx} className="flex items-center gap-2 px-3 py-2 border border-gray-100 rounded-xl">
                  <span className="text-xs font-semibold text-[#94A3B8] w-14 shrink-0">Part {idx + 1}</span>
                  <select value={p.role} onChange={e => updatePart(idx, { role: e.target.value as PartDef['role'] })}
                    className="text-sm border border-gray-200 rounded-lg px-2 py-1">
                    <option value="Hook">Hook</option>
                    <option value="Body">Body</option>
                    <option value="CTA">CTA</option>
                  </select>
                  <input type="number" min={1} max={s1.sceneCount} value={p.sceneCount}
                    onChange={e => updatePart(idx, { sceneCount: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                    className="w-16 text-sm border border-gray-200 rounded-lg px-2 py-1" title="Jumlah scene" />
                  <span className="text-xs text-[#94A3B8]">scene</span>
                  <input type="text" value={p.label ?? ''} placeholder="Label (opsional)"
                    onChange={e => updatePart(idx, { label: e.target.value })}
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1 min-w-0" />
                  <button type="button" onClick={() => removePart(idx)}
                    className="text-xs text-red-500 hover:text-red-700 shrink-0">Hapus</button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <button type="button" onClick={addPart}
                  className="text-xs font-semibold text-[#1565C0] hover:text-[#0F4C9E]">+ Tambah Part</button>
                {(s1.parts ?? []).length > 0 && (() => {
                  const sum = s1.parts!.reduce((s, p) => s + p.sceneCount, 0);
                  return sum !== s1.sceneCount ? (
                    <span className="text-xs text-amber-600">
                      Jumlah scene di Part ({sum}) belum sama dengan Jumlah Scene total ({s1.sceneCount}) — role fallback ke otomatis sampai cocok.
                    </span>
                  ) : (
                    <span className="text-xs text-emerald-600">✓ Sum cocok, Part aktif</span>
                  );
                })()}
              </div>
            </div>
          </Field>

          {prop.images.length === 0 ? (
            <div className="text-center py-10">
              <ImageOff size={28} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-[#64748B]">Properti ini belum punya foto. Tambahkan foto di menu Properti dulu.</p>
            </div>
          ) : (
            Array.from({ length: s1.sceneCount }).map((_, i) => {
              const sc = scenes[i];
              const role = sceneRoleFromParts(i, s1.sceneCount, s1.parts);
              const isOpen = activePhotoScene === i + 1;
              const selectedImg = sc?.photoId != null ? prop.images.find(im => im.id === sc.photoId) : null;
              const usesParts = partsValidForTotal(s1.parts, s1.sceneCount);
              const partIdx = usesParts ? partIndexForScene(i, s1.parts, s1.sceneCount) : -1;
              const isFirstOfPart = usesParts && partIdx >= 0 && (i === 0 || partIndexForScene(i - 1, s1.parts, s1.sceneCount) !== partIdx);
              const part = isFirstOfPart ? s1.parts![partIdx] : null;
              return (
                <div key={i}>
                  {part && (
                    <div className="text-xs font-semibold text-[#1565C0] uppercase tracking-wide px-1 pt-2 pb-1">
                      Part {partIdx + 1} — {part.role}{part.label ? `: ${part.label}` : ''}
                    </div>
                  )}
                <div className="border border-gray-100 rounded-xl">
                  <button type="button"
                    onClick={() => setActivePhotoScene(isOpen ? 0 : i + 1)}
                    className={`w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors ${isOpen ? 'rounded-t-xl' : 'rounded-xl'}`}>
                    <span className="font-semibold text-[#0F172A] text-sm flex items-center gap-2">
                      Scene {i + 1} <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1565C0]">{role}</span>
                      {selectedImg && (
                        <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                          <img src={thumbSrc(selectedImg.url_webp, 64)} alt="" className="w-6 h-6 rounded object-cover" loading="lazy" decoding="async" />
                          <Check size={13} /> Foto dipilih
                        </span>
                      )}
                    </span>
                    <span className="text-[#94A3B8] text-xs">{isOpen ? '▲' : '▼'}</span>
                  </button>

                  {isOpen && (
                    <div className="p-4 space-y-3">
                      {/* Grid foto */}
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                        {prop.images.map(im => {
                          const selected = sc?.photoId === im.id;
                          const src = thumbSrc(im.url_webp, 160);
                          // Memilih foto ikut mengisi labelnya dari label_ruangan
                          // tersimpan (migrasi 0026) — kecuali scene ini sudah
                          // dilabeli manual, yang tidak boleh ditimpa diam-diam.
                          return (
                            <button key={im.id} type="button"
                              onClick={() => setScene(i, {
                                photoId: im.id,
                                ...(sc?.label ? {} : { label: im.label_ruangan?.trim() || '' }),
                              })}
                              style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 80px' }}
                              className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                                selected ? 'border-[#1565C0] ring-2 ring-[#1565C0]/30' : 'border-transparent hover:border-gray-300'
                              }`}>
                              {src ? (
                                <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                              ) : (
                                <div className="w-full h-full bg-gray-100 flex items-center justify-center"><ImageOff size={14} className="text-gray-300" /></div>
                              )}
                              {selected && (
                                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#1565C0] flex items-center justify-center">
                                  <Check size={10} className="text-white" />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Label foto — ikut tersimpan ke database (property_images.label_ruangan)
                          begitu foto sudah dipilih, supaya tidak perlu label ulang di Detail
                          Properti dan AI Rancang Storyboard langsung bisa dipakai. */}
                      <div className="sm:w-64">
                        <label className="block text-xs font-medium text-[#64748B] mb-1">Label Foto</label>
                        <LabelSelect value={sc?.label ?? ''} onChange={v => {
                          setScene(i, { label: v });
                          if (sc?.photoId != null) savePhotoLabel(sc.photoId, v);
                        }} options={PHOTO_LABELS} />
                        {sc?.photoId != null && (
                          <p className="text-[10px] text-[#94A3B8] mt-1">Tersimpan otomatis ke data foto properti.</p>
                        )}
                      </div>

                      <button type="button"
                        onClick={() => setActivePhotoScene(i + 1 < s1.sceneCount ? i + 2 : 0)}
                        className="w-full text-xs text-[#1565C0] hover:text-[#0F4C9E] py-1 font-medium">
                        {i + 1 < s1.sceneCount ? `Lanjut ke Scene ${i + 2} →` : '✓ Semua scene selesai'}
                      </button>
                    </div>
                  )}
                </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ─── STEP 2 — Pilih Karakter ─── */}
      {step === 2 && <CharacterStep value={s3} onChange={update3} />}

      {/* ─── STEP 4 — Generate & Validate ─── */}
      {step === 4 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
          <h2 className="font-display font-bold text-[#0F172A]">Step 4 — Generate Prompt &amp; Validasi</h2>

          {/* Tab toggle */}
          <div className="flex gap-2 border-b border-gray-100 -mx-1 px-1">
            {([
              { v: 'prompt', label: 'Master Prompt', icon: <Copy size={14} /> },
              { v: 'validate', label: 'Paste & Validate', icon: <FileCheck2 size={14} /> },
              { v: 'video_vo', label: 'Video VO', icon: <Film size={14} /> },
              { v: 'ai_generate', label: 'AI Generate ✨', icon: <Sparkles size={14} /> },
              { v: 'library', label: 'Library', icon: <Film size={14} /> },
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
                  {copied ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy Master Prompt</>}
                </button>
                <button onClick={handleDownload}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-[#1565C0] border border-[#1565C0]/30 hover:bg-[#F0F7FF] transition-colors">
                  <Download size={15} /> Download .txt
                </button>
              </div>

              <p className="text-sm text-[#64748B]">
                Salin teks di bawah, paste ke AI eksternal (mis. ChatGPT/Gemini/Claude) untuk menghasilkan JSON Scene.
                Lalu buka tab <strong>Paste &amp; Validate</strong> untuk menempel hasilnya.
              </p>

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
                <span>{s1.sceneCount} scene</span>
                <span>·</span>
                <span>Total {s1.durationMode === 'uniform'
                  ? s1.uniformDuration * s1.sceneCount
                  : s1.manualDurations.slice(0, s1.sceneCount).reduce((a, b) => a + (b || 0), 0)} detik</span>
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

          {/* ── TAB 3: VIDEO VO ── */}
          {step4Tab === 'video_vo' && prop && (
            <VideoVOTabMemo
              propertyId={prop.id}
              propertyTitle={prop.title}
              jenisProperti={prop.jenis_properti}
              lokasi={`${prop.kecamatan}, ${prop.kabupaten}`}
              photos={prop.images}
            />
          )}

          {/* ── TAB 4: AI GENERATE (Jalur C) ── */}
          {step4Tab === 'ai_generate' && prop && (
            <AIGenerateTabMemo
              propertyId={prop.id}
              propertyTitle={prop.title}
              kodeListingStr={prop.kode_listing}
              jumlahScene={s1.sceneCount}
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
              sceneRoles={sceneRolesForAI}
              scenePhotos={scenePhotosForAI}
              sceneDurations={durations}
              selectedKarakter={selectedKarakterForAI}
              onEditStep={setStep}
            />
          )}

          {/* ── TAB 5: CONTENT LIBRARY ── */}
          {step4Tab === 'library' && prop && (
            <VideoLibraryMemo propertyId={prop.id} />
          )}

          {/* ── TAB 6: UPLOAD HASIL (Cloudinary, tertaut karakter/agent) ── */}
          {step4Tab === 'upload' && prop && (
            <UploadAgentVideoMemo
              propertyId={prop.id}
              kodeListing={prop.kode_listing}
              defaultCharacterId={s3.character?.id ?? null}
              platform={platformForAI}
              registerInstruction={REGISTER_INSTRUCTION[s1.register] ?? ''}
            />
          )}

          {/* ── TAB 2: PASTE & VALIDATE ── */}
          {step4Tab === 'validate' && (
            <div className="space-y-4">
              <p className="text-sm text-[#64748B]">
                Tempel hasil JSON dari AI eksternal di sini, lalu klik Validasi. Scene Cards &amp; tombol unduh ZIP akan muncul jika JSON valid.
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

              {/* Scene Cards */}
              {validData && (
                <div className="pt-1">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 mb-3">
                    <Check size={15} /> JSON valid — {validData.scenes?.length ?? 0} scene
                  </div>
                  <SceneCards data={validData} scenes={scenes} durations={durations} />
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
      )}

      {/* ─── Navigasi wizard ─── */}
      <div className="flex items-center justify-between">
        <button onClick={goBack} disabled={step === 1}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-[#64748B] border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          <ArrowLeft size={15} /> Kembali
        </button>
        {step < 4 ? (
          <button onClick={goNext}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
            Lanjut <ArrowRight size={15} />
          </button>
        ) : (
          <span className="text-xs text-[#94A3B8]">Fase V4 — Coming Soon</span>
        )}
      </div>
      </>)}
    </div>
  );
}
