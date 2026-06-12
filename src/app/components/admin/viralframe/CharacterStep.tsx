import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Check, Trash2, ImageOff, Upload, X, Loader2 } from 'lucide-react';
import {
  EXPRESSIONS, ETHNIC_OPTIONS, STYLE_OPTIONS, GENDER_OPTIONS,
} from './options';

export interface Step3State {
  useCharacter: boolean;
  characterId: number | null;
  visualAnchor: string;
  expression: string;
}

interface Character {
  id: number; nama: string; foto_url: string;
  gender: string | null; usia: number | null;
  etnik: string | null; style: string | null; ciri_fisik: string | null;
}

const selectCls =
  'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] bg-white transition-colors';

function charSrc(url: string | null) {
  if (!url) return null;
  if (url.startsWith('viralframe-characters/') || url.startsWith('property-photos/')) {
    return `/api/admin/media?key=${encodeURIComponent(url)}`;
  }
  return url;
}

// Konversi file gambar → WebP base64 (pola sama PropertyPhotosCard)
function convertToWebP(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas tidak tersedia')); return; }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('Konversi WebP gagal')); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsDataURL(blob);
      }, 'image/webp', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gagal membaca gambar')); };
    img.src = url;
  });
}

interface FormState {
  nama: string; gender: string; usia: string;
  etnik: string; style: string; ciri_fisik: string;
  preview: string; // data:image/webp;base64
}

const EMPTY_FORM: FormState = {
  nama: '', gender: 'Pria', usia: '',
  etnik: 'asia_tenggara', style: 'kasual_modern', ciri_fisik: '', preview: '',
};

export default function CharacterStep({ value, onChange }: {
  value: Step3State;
  onChange: (patch: Partial<Step3State>) => void;
}) {
  const [chars, setChars] = useState<Character[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchChars = useCallback(async () => {
    setLoading(true); setListError('');
    try {
      const res = await fetch('/api/admin/viralframe/characters', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setChars(json.data?.items ?? []);
    } catch (err: unknown) {
      setListError(err instanceof Error ? err.message : 'Gagal memuat karakter');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch saat mode "Gunakan Karakter" aktif (sekali, atau saat radio dipilih)
  useEffect(() => {
    if (value.useCharacter && chars.length === 0 && !listError) fetchChars();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.useCharacter]);

  const handlePick = async (file: File | undefined) => {
    if (!file) return;
    setFormError('');
    try {
      const webp = await convertToWebP(file);
      setForm(f => ({ ...f, preview: webp }));
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Gagal memproses gambar');
    }
  };

  const submitUpload = async () => {
    if (!form.nama.trim()) { setFormError('Nama karakter wajib diisi'); return; }
    if (!form.preview) { setFormError('Foto karakter wajib diunggah'); return; }
    setUploading(true); setFormError('');
    try {
      const res = await fetch('/api/admin/viralframe/characters', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: form.nama.trim(),
          foto: form.preview,
          gender: form.gender,
          usia: form.usia ? parseInt(form.usia, 10) : null,
          etnik: form.etnik,
          style: form.style,
          ciri_fisik: form.ciri_fisik.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const newId = json.data?.karakter?.id ?? null;
      await fetchChars();
      if (newId) onChange({ characterId: newId });
      setShowForm(false);
      setForm(EMPTY_FORM);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan karakter');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (c: Character) => {
    if (!window.confirm(`Hapus karakter "${c.nama}" dari library?`)) return;
    setDeletingId(c.id);
    try {
      const res = await fetch(`/api/admin/viralframe/characters/${c.id}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (value.characterId === c.id) onChange({ characterId: null });
      await fetchChars();
    } catch (err: unknown) {
      alert(`Gagal menghapus: ${err instanceof Error ? err.message : 'Error'}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-5">
      <h2 className="font-display font-bold text-[#0F172A]">Step 3 — Pilih Karakter</h2>

      {/* Radio pilihan */}
      <div className="flex flex-col sm:flex-row gap-3">
        {[
          { v: false, label: 'Tanpa Karakter', desc: 'Video fokus pada properti/visual saja' },
          { v: true,  label: 'Gunakan Karakter', desc: 'Tampilkan talent/presenter di video' },
        ].map(opt => {
          const active = value.useCharacter === opt.v;
          return (
            <button key={String(opt.v)} type="button"
              onClick={() => onChange({ useCharacter: opt.v })}
              className={`flex-1 text-left px-4 py-3 rounded-xl border transition-colors ${
                active ? 'border-[#1565C0] bg-[#EFF6FF]' : 'border-gray-200 hover:bg-gray-50'
              }`}>
              <div className="flex items-center gap-2">
                <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${active ? 'border-[#1565C0]' : 'border-gray-300'}`}>
                  {active && <span className="w-2 h-2 rounded-full bg-[#1565C0]" />}
                </span>
                <span className="font-semibold text-sm text-[#0F172A]">{opt.label}</span>
              </div>
              <p className="text-xs text-[#64748B] mt-1 ml-6">{opt.desc}</p>
            </button>
          );
        })}
      </div>

      {/* ── TANPA KARAKTER ── */}
      {!value.useCharacter && (
        <div>
          <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Visual Anchor <span className="text-[#94A3B8] font-normal">(opsional)</span></label>
          <input type="text" value={value.visualAnchor}
            onChange={e => onChange({ visualAnchor: e.target.value })}
            placeholder="cth: papan nama properti selalu terlihat di setiap scene"
            className={selectCls} />
          <p className="text-xs text-[#94A3B8] mt-1">Elemen visual konsisten yang muncul di tiap scene agar video terasa menyatu.</p>
        </div>
      )}

      {/* ── GUNAKAN KARAKTER ── */}
      {value.useCharacter && (
        <div className="space-y-4">
          {/* Grid karakter */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#0F172A]">Character Library</span>
            <button type="button" onClick={() => { setShowForm(true); setFormError(''); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#1565C0] border border-[#1565C0]/30 hover:bg-[#F0F7FF] transition-colors">
              <Plus size={14} /> Upload Karakter Baru
            </button>
          </div>

          {loading && (
            <div className="py-8 text-center text-[#94A3B8] text-sm">
              <Loader2 size={20} className="animate-spin mx-auto mb-2" /> Memuat karakter…
            </div>
          )}
          {listError && (
            <div className="text-sm text-red-600">{listError} — <button onClick={fetchChars} className="underline">Coba lagi</button></div>
          )}

          {!loading && !listError && chars.length === 0 && (
            <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl">
              <ImageOff size={24} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-[#64748B]">Belum ada karakter. Klik "Upload Karakter Baru".</p>
            </div>
          )}

          {chars.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              {chars.map(c => {
                const selected = value.characterId === c.id;
                const src = charSrc(c.foto_url);
                return (
                  <div key={c.id} className="relative">
                    <button type="button" onClick={() => onChange({ characterId: c.id })}
                      className={`w-full rounded-xl overflow-hidden border-2 transition-all ${
                        selected ? 'border-[#1565C0] ring-2 ring-[#1565C0]/30' : 'border-transparent hover:border-gray-300'
                      }`}>
                      <div className="aspect-square bg-gray-100">
                        {src ? <img src={src} alt={c.nama} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center"><ImageOff size={16} className="text-gray-300" /></div>}
                      </div>
                      <div className="px-1.5 py-1 text-[11px] font-medium text-[#0F172A] truncate text-center">{c.nama}</div>
                      {selected && (
                        <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-[#1565C0] flex items-center justify-center">
                          <Check size={10} className="text-white" />
                        </span>
                      )}
                    </button>
                    <button type="button" onClick={() => handleDelete(c)} disabled={deletingId === c.id}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 hover:bg-red-50 border border-gray-200 flex items-center justify-center text-red-500 disabled:opacity-40"
                      title="Hapus karakter">
                      {deletingId === c.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Ekspresi (muncul setelah karakter terpilih) */}
          {value.characterId != null && (
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Ekspresi & Emosi Karakter</label>
              <select value={value.expression} onChange={e => onChange({ expression: e.target.value })} className={selectCls}>
                {EXPRESSIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <p className="text-xs text-[#94A3B8] mt-1">
                {EXPRESSIONS.find(e => e.value === value.expression)?.desc}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── MODAL UPLOAD KARAKTER ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !uploading && setShowForm(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-[#0F172A]">Upload Karakter Baru</h3>
              <button onClick={() => !uploading && setShowForm(false)} className="text-[#94A3B8] hover:text-[#0F172A]"><X size={18} /></button>
            </div>

            {/* Foto */}
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Foto Karakter <span className="text-red-500">*</span></label>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => handlePick(e.target.files?.[0])} />
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-full aspect-video rounded-xl border-2 border-dashed border-gray-200 hover:border-[#1565C0] flex items-center justify-center overflow-hidden transition-colors">
                {form.preview
                  ? <img src={form.preview} alt="preview" className="w-full h-full object-cover" />
                  : <span className="flex flex-col items-center text-[#94A3B8] text-sm"><Upload size={22} className="mb-1" /> Pilih foto</span>}
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Nama <span className="text-red-500">*</span></label>
              <input type="text" value={form.nama} maxLength={120}
                onChange={e => setForm(f => ({ ...f, nama: e.target.value }))}
                placeholder="cth: Rina (Presenter)" className={selectCls} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Gender</label>
                <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} className={selectCls}>
                  {GENDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Usia</label>
                <input type="number" min={18} max={65} value={form.usia}
                  onChange={e => setForm(f => ({ ...f, usia: e.target.value }))}
                  placeholder="18–65" className={selectCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Etnik</label>
                <select value={form.etnik} onChange={e => setForm(f => ({ ...f, etnik: e.target.value }))} className={selectCls}>
                  {ETHNIC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Style</label>
                <select value={form.style} onChange={e => setForm(f => ({ ...f, style: e.target.value }))} className={selectCls}>
                  {STYLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Ciri Fisik <span className="text-[#94A3B8] font-normal">(opsional)</span></label>
              <input type="text" value={form.ciri_fisik} maxLength={500}
                onChange={e => setForm(f => ({ ...f, ciri_fisik: e.target.value }))}
                placeholder="cth: rambut pendek, tinggi 170cm, berkacamata" className={selectCls} />
            </div>

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={() => setShowForm(false)} disabled={uploading}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-[#64748B] border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
                Batal
              </button>
              <button onClick={submitUpload} disabled={uploading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
                {uploading && <Loader2 size={14} className="animate-spin" />}
                {uploading ? 'Menyimpan…' : 'Simpan Karakter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
