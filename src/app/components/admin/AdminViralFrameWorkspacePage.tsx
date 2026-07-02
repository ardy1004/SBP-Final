import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  ArrowLeft, ArrowRight, ImageOff, Check, Film, AlertCircle,
  Copy, Download, Loader2, FileCheck2, FileArchive, X, Sparkles,
} from 'lucide-react';
import JSZip from 'jszip';
import {
  AI_TOOLS, RATIOS, LANGUAGES, HOOK_TYPES, CTA_TYPES, VISUAL_STYLES,
  TONES, PLATFORMS, PHOTO_LABELS, sceneRole,
  sceneFileName, characterFileName,
} from './viralframe/options';
import CharacterStep, { type Step3State } from './viralframe/CharacterStep';
import { compileMasterPrompt, estimateTokens } from './viralframe/masterPromptCompiler';
import { validateSceneJson, type ParsedJSON, type ValidateResult } from './viralframe/jsonValidator';
import SceneCards from './viralframe/SceneCards';

// ─── Tipe data ────────────────────────────────────────────────────────────
interface PropertyImage { id: number; url_webp: string; alt_text: string | null; urutan: number; is_cover: number }
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

function resize<T>(arr: T[], len: number, fill: () => T): T[] {
  const next = arr.slice(0, len);
  while (next.length < len) next.push(fill());
  return next;
}

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
    { n: 1, label: 'Parameter Video', enabled: true },
    { n: 2, label: 'Pilih Foto per Scene', enabled: true },
    { n: 3, label: 'Pilih Karakter', enabled: true },
    { n: 4, label: 'Generate Prompt', enabled: false },
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

const GAYA_KAMERA = [
  { label: '🚁 Drone Pull-back', value: 'drone_pullback', prompt: 'cinematic drone shot slowly pulling back and ascending revealing the full facade of the property, smooth aerial motion, golden hour warm lighting, professional real estate videography, 4K quality' },
  { label: '🔄 Aerial Orbit', value: 'aerial_orbit', prompt: 'smooth aerial orbit shot slowly circling around the property from elevated position, wide angle revealing surrounding environment, cinematic drone photography, clear sky' },
  { label: '▶️ Dolly Push-in', value: 'dolly_pushin', prompt: 'cinematic dolly push-in shot from street level slowly approaching the property main entrance, smooth forward tracking motion, wide angle lens, professional architectural videography' },
  { label: '⬆️ Crane Rise', value: 'crane_rise', prompt: 'camera crane rising smoothly from ground level to aerial view revealing full height of building and surroundings, slow upward motion, architectural real estate style' },
  { label: '🏠 Walk-through', value: 'walkthrough', prompt: 'smooth steadicam walk-through shot moving forward through the interior space, first-person cinematic perspective, warm natural lighting, professional property tour style' },
  { label: '📐 Establishing Wide', value: 'establishing', prompt: 'wide angle establishing shot from elevated position showing full property and surrounding neighborhood, static camera, golden hour lighting, cinematic real estate photography' },
  { label: '🎯 Close Detail', value: 'close_detail', prompt: 'slow cinematic lateral pan across architectural details and surfaces, close-up macro style, shallow depth of field, smooth horizontal motion revealing textures and materials' },
];

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

function VideoVOTab({ propertyTitle, jenisProperti, lokasi, photos }: VideoVOTabProps) {
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
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setNaskah(json.naskah ?? '');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal generate naskah');
    } finally {
      setIsGeneratingNaskah(false);
    }
  };

  const photoToBase64 = async (url_webp: string): Promise<string> => {
    const src = mediaSrc(url_webp);
    if (!src) throw new Error('URL foto tidak valid');
    const res = await fetch(src, { credentials: 'include' });
    if (!res.ok) throw new Error(`Gagal fetch foto (HTTP ${res.status})`);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      const objectUrl = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const MAX = 960;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > MAX || h > MAX) {
          if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas tidak tersedia')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        // Ambil HANYA raw base64, tanpa prefix data:image/...
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        const base64 = dataUrl.split(',')[1]; // strip 'data:image/jpeg;base64,'
        console.log(`[VideoVO] image base64 length: ${base64.length} chars (~${Math.round(base64.length * 0.75 / 1024)}KB)`);
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
        const scene = voScenes[i];
        if (!scene.foto_url || !scene.gaya_kamera) continue;
        const image_raw_b64: string = await photoToBase64(scene.foto_url);
        const submitRes = await fetch('/api/admin/viralframe/submit-video', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ image_base64: image_raw_b64, prompt: scene.prompt_en, scene_index: i }),
        });
        if (!submitRes.ok && submitRes.headers.get('content-type')?.includes('text/html')) {
          throw new Error(`Scene ${i + 1}: endpoint tidak ditemukan (HTTP ${submitRes.status}) — cek deployment`);
        }
        const submitJson = await submitRes.json();
        if (!submitRes.ok) throw new Error(`Scene ${i + 1}: ${submitJson.error ?? 'Submit gagal'}`);
        const { request_id } = submitJson;
        setVideoResults(prev => prev.map((r, ri) => ri === i ? { ...r, request_id, status: 'pending' } : r));
        // Poll until done (max 40 × 3s = 120s)
        let done = false;
        for (let p = 0; p < 40 && !done; p++) {
          await new Promise(r => setTimeout(r, 3000));
          const statusRes = await fetch(`/api/admin/viralframe/video-status/${request_id}`, { credentials: 'include' });
          const statusJson = await statusRes.json();
          const status: VideoResult['status'] = statusJson.status ?? 'pending';
          setVideoResults(prev => prev.map((r, ri) => ri === i ? { ...r, status, video_url: statusJson.video_url ?? null } : r));
          if (status === 'succeed' && statusJson.video_url) {
            const videoRes = await fetch(statusJson.video_url);
            const videoBlob = await videoRes.blob();
            setVideoResults(prev => prev.map((r, ri) => ri === i ? { ...r, blob: videoBlob } : r));
            done = true;
          } else if (status === 'failed') {
            done = true;
          }
        }
        if (!done) setVideoResults(prev => prev.map((r, ri) => ri === i ? { ...r, status: 'failed' } : r));
      }
    } catch (err: unknown) {
      setGenError(err instanceof Error ? err.message : 'Gagal generate video');
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
        const err = await res.json();
        throw new Error(err.error ?? 'Gagal generate voiceover');
      }
      const blob = new Blob([await res.arrayBuffer()], { type: res.headers.get('Content-Type') || 'audio/mpeg' });
      setVoiceoverBlob(blob);
      setVoiceoverUrl(URL.createObjectURL(blob));
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
      const url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
      setFinalVideoUrl(url);
      setMergeProgress('✅ Selesai!');
    } catch (err: unknown) {
      setMergeProgress(`Error: ${err instanceof Error ? err.message : 'Gagal merge'}`);
    } finally {
      setIsMerging(false);
    }
  };

  const canGenerateVideos = voScenes.every(s => s.foto_id !== null && s.gaya_kamera !== '');
  const allVideosReady = videoResults.length === voScenes.length && videoResults.length > 0 && videoResults.every(r => r.blob !== null);

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
                      <img src={mediaSrc(selectedPhoto.url_webp) ?? ''} alt="" className="w-full h-full object-cover" />
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

// ─── Halaman utama ──────────────────────────────────────────────────────────
export default function AdminViralFrameWorkspacePage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [prop, setProp] = useState<PropertyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  const [showErrors, setShowErrors] = useState(false);

  const [s1, setS1] = useState<Step1State>({
    sceneCount: 4,
    durationMode: 'uniform',
    uniformDuration: 6,
    manualDurations: [6, 6, 6, 6],
    platforms: ['tiktok'],
    aiTool: 'veo3',
    ratio: '9:16',
    language: 'id',
    hookType: 'auto',
    ctaType: 'auto',
    ctaKeyword: '',
    visualStyle: 'auto',
    tone: 'auto',
    niche: 'real_estate',
  });
  const [scenes, setScenes] = useState<SceneAssign[]>(
    Array.from({ length: 4 }, () => ({ photoId: null, label: '' }))
  );
  const [s3, setS3] = useState<Step3State>({
    useCharacter: false,
    characterId: null,
    visualAnchor: '',
    expression: 'auto',
  });
  const update3 = useCallback((patch: Partial<Step3State>) =>
    setS3(prev => ({ ...prev, ...patch })), []);

  // Step 4 — compile + save history
  const [copied, setCopied] = useState(false);
  const [generationId, setGenerationId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const savedPromptRef = useRef<string>('');

  // Step 4 — Tab Paste & Validate (Fase V4b)
  const [step4Tab, setStep4Tab] = useState<'prompt' | 'validate' | 'video_vo'>('prompt');
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
        const json = await res.json();
        if (!cancel) setProp(json.data ?? null);
      } catch (err: unknown) {
        if (!cancel) setError(err instanceof Error ? err.message : 'Gagal memuat properti');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [id]);

  // Ubah jumlah scene → resize manualDurations & scenes (pertahankan nilai lama)
  const setSceneCount = useCallback((raw: number) => {
    const n = Math.max(2, Math.min(12, raw || 0));
    setS1(prev => ({
      ...prev,
      sceneCount: n,
      manualDurations: resize(prev.manualDurations, n, () => prev.uniformDuration || 6),
    }));
    setScenes(prev => resize(prev, n, () => ({ photoId: null, label: '' })));
  }, []);

  const update1 = <K extends keyof Step1State>(key: K, val: Step1State[K]) =>
    setS1(prev => ({ ...prev, [key]: val }));

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

  // ─── Validasi ───────────────────────────────────────────────────────────
  const step1Errors = useMemo(() => {
    const e: string[] = [];
    if (s1.sceneCount < 2 || s1.sceneCount > 12) e.push('Jumlah scene harus 2–12.');
    if (s1.platforms.length === 0) e.push('Pilih minimal 1 platform distribusi.');
    if (s1.durationMode === 'uniform') {
      if (!(s1.uniformDuration > 0)) e.push('Durasi per scene harus lebih dari 0.');
    } else {
      const bad = s1.manualDurations.slice(0, s1.sceneCount).some(d => !(d > 0));
      if (bad) e.push('Setiap durasi scene harus lebih dari 0.');
    }
    if (s1.ctaType === 'comment_keyword' && !s1.ctaKeyword.trim()) {
      e.push('Keyword komentar wajib diisi untuk CTA "Komen [KEYWORD]".');
    }
    return e;
  }, [s1]);

  const step2Errors = useMemo(() => {
    const e: string[] = [];
    scenes.slice(0, s1.sceneCount).forEach((sc, i) => {
      if (sc.photoId == null) e.push(`Scene ${i + 1}: belum memilih foto.`);
      if (!sc.label) e.push(`Scene ${i + 1}: belum memilih label foto.`);
    });
    return e;
  }, [scenes, s1.sceneCount]);

  const step3Errors = useMemo(() => {
    const e: string[] = [];
    if (s3.useCharacter && s3.characterId == null) {
      e.push('Pilih atau upload karakter terlebih dahulu.');
    }
    return e;
  }, [s3]);

  const errorsFor = (st: number) => (st === 1 ? step1Errors : st === 2 ? step2Errors : st === 3 ? step3Errors : []);

  const goNext = () => {
    const errs = errorsFor(step);
    if (errs.length > 0) { setShowErrors(true); return; }
    setShowErrors(false);
    setStep(s => Math.min(4, s + 1));
  };
  const goBack = () => { setShowErrors(false); setStep(s => Math.max(1, s - 1)); };

  // ─── Step 4: compile Master Prompt (pure, re-compile saat state berubah) ──
  const masterPrompt = useMemo(
    () => (prop ? compileMasterPrompt(prop, s1, scenes, s3) : ''),
    [prop, s1, scenes, s3],
  );

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
        params_json: JSON.stringify({ s1, scenes, s3 }),
        master_prompt: masterPrompt,
      }),
    })
      .then(r => r.json())
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

  // Reset hasil validasi bila prompt (param) berubah agar tidak stale.
  useEffect(() => {
    setValResult(null); setValidData(null); setWarningsDismissed(false); setZipError('');
  }, [masterPrompt]);

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

      // (e) generate + download
      const out = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = url;
      a.download = `viralframe_${prop.kode_listing}_${Date.now()}.zip`;
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
            <img src={coverUrl} alt={prop.title} className="w-full h-full object-cover"
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

      {/* ─── STEP 1 ─── */}
      {step === 1 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-5">
          <h2 className="font-display font-bold text-[#0F172A]">Step 1 — Parameter Video</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* (a) Jumlah Scene */}
            <Field label="Jumlah Scene" hint="Antara 2–12 scene">
              <input type="number" min={2} max={12} value={s1.sceneCount}
                onChange={e => setSceneCount(parseInt(e.target.value, 10))}
                className={selectCls} />
            </Field>

            {/* (b) Mode Durasi */}
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
                      <td className="px-3 py-1.5 text-[#0F172A]">Scene {i + 1} <span className="text-[#94A3B8] text-xs">({sceneRole(i, s1.sceneCount)})</span></td>
                      <td className="px-3 py-1.5">
                        <input type="number" min={1} max={60} value={s1.manualDurations[i] ?? 0}
                          onChange={e => setManualDuration(i, parseInt(e.target.value, 10) || 0)}
                          className="w-24 px-2 py-1 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#1565C0]" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

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

      {/* ─── STEP 2 ─── */}
      {step === 2 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-5">
          <h2 className="font-display font-bold text-[#0F172A]">Step 2 — Pilih Foto per Scene</h2>
          <p className="text-sm text-[#64748B] -mt-3">
            Pilih 1 foto untuk tiap scene. Foto yang sama boleh dipakai di beberapa scene.
          </p>

          {prop.images.length === 0 ? (
            <div className="text-center py-10">
              <ImageOff size={28} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-[#64748B]">Properti ini belum punya foto. Tambahkan foto di menu Properti dulu.</p>
            </div>
          ) : (
            Array.from({ length: s1.sceneCount }).map((_, i) => {
              const sc = scenes[i];
              const role = sceneRole(i, s1.sceneCount);
              return (
                <div key={i} className="border border-gray-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#0F172A] text-sm">
                      Scene {i + 1} <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1565C0] ml-1">{role}</span>
                    </span>
                    {sc?.photoId != null && <span className="text-xs text-emerald-600 flex items-center gap-1"><Check size={13} /> Foto dipilih</span>}
                  </div>

                  {/* Grid foto */}
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {prop.images.map(im => {
                      const selected = sc?.photoId === im.id;
                      const src = mediaSrc(im.url_webp);
                      return (
                        <button key={im.id} type="button" onClick={() => setScene(i, { photoId: im.id })}
                          className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                            selected ? 'border-[#1565C0] ring-2 ring-[#1565C0]/30' : 'border-transparent hover:border-gray-300'
                          }`}>
                          {src ? (
                            <img src={src} alt="" className="w-full h-full object-cover" />
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

                  {/* Label foto */}
                  <div className="sm:w-64">
                    <label className="block text-xs font-medium text-[#64748B] mb-1">Label Foto</label>
                    <select value={sc?.label ?? ''} onChange={e => setScene(i, { label: e.target.value })} className={selectCls}>
                      <option value="">— Pilih label —</option>
                      {PHOTO_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ─── STEP 3 — Pilih Karakter ─── */}
      {step === 3 && <CharacterStep value={s3} onChange={update3} />}

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

              <textarea readOnly value={masterPrompt}
                className="w-full h-96 max-h-[60vh] overflow-y-auto p-3 border border-gray-200 rounded-xl text-xs font-mono text-[#0F172A] bg-[#F8FAFC] outline-none resize-y leading-relaxed"
              />

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
            <VideoVOTab
              propertyId={prop.id}
              propertyTitle={prop.title}
              jenisProperti={prop.jenis_properti}
              lokasi={`${prop.kecamatan}, ${prop.kabupaten}`}
              photos={prop.images}
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
    </div>
  );
}
