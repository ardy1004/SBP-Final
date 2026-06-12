import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  ArrowLeft, ArrowRight, ImageOff, Check, Film, AlertCircle,
  Copy, Download, Loader2,
} from 'lucide-react';
import {
  AI_TOOLS, RATIOS, LANGUAGES, HOOK_TYPES, CTA_TYPES, VISUAL_STYLES,
  TONES, PLATFORMS, PHOTO_LABELS, sceneRole,
} from './viralframe/options';
import CharacterStep, { type Step3State } from './viralframe/CharacterStep';
import { compileMasterPrompt, estimateTokens } from './viralframe/masterPromptCompiler';

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

      {/* ─── STEP 4 — Master Prompt ─── */}
      {step === 4 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-display font-bold text-[#0F172A]">Step 4 — Master Prompt</h2>
            <div className="flex items-center gap-2">
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
          </div>

          <p className="text-sm text-[#64748B] -mt-1">
            Salin teks di bawah, paste ke AI eksternal (mis. ChatGPT/Gemini/Claude) untuk menghasilkan JSON Scene.
            Validasi JSON &amp; Scene Cards akan hadir di Fase V4b.
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
