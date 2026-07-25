import { bacaJson } from '../../../lib/api';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Star, Plus, Pencil, Trash2, Loader2, AlertCircle, Eye, EyeOff, Upload, User } from 'lucide-react';

interface Testimoni {
  id: number;
  nama_klien: string;
  foto_url: string | null;
  lokasi: string | null;
  rating: number;
  isi_testimoni: string;
  jenis_transaksi: string | null;
  properti_terkait: number | null;
  tanggal: string | null;
  tampilkan: number;
  urutan: number;
  created_at: string;
}

type FormData = {
  nama_klien: string;
  isi_testimoni: string;
  rating: number;
  lokasi: string;
  foto_url: string;
  jenis_transaksi: string;
  tampilkan: boolean;
  urutan: number;
};

const EMPTY_FORM: FormData = {
  nama_klien: '',
  isi_testimoni: '',
  rating: 5,
  lokasi: '',
  foto_url: '',
  jenis_transaksi: '',
  tampilkan: true,
  urutan: 0,
};

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    ...opts,
  });
  const json = await bacaJson(res);
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  // Backend membungkus payload sebagai { success, data: {...} } (lihat _shared/response.js).
  // Kembalikan isi `data` agar pemanggil bisa membaca field (mis. items) secara langsung.
  return json.data ?? json;
}

/** Resolusi foto_url: key R2 (testimonials/…) → proxy publik; URL http(s) → apa adanya. */
function mediaSrc(u: string | null | undefined): string {
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return `/api/media?key=${encodeURIComponent(u)}`;
}

const FALLBACK_AVATAR =
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80';

/** Konversi File gambar → data URL WebP (kualitas 0.85). */
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
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('Konversi WebP gagal')); return; }
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('FileReader error'));
          reader.readAsDataURL(blob);
        },
        'image/webp',
        0.85
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gagal membaca gambar')); };
    img.src = url;
  });
}

function StarRow({ rating, onChange }: { rating: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((v) => (
        <Star
          key={v}
          size={16}
          fill={v <= rating ? '#F5A623' : 'none'}
          className={`${v <= rating ? 'text-[#F5A623]' : 'text-[#CBD5E1]'} ${onChange ? 'cursor-pointer' : ''}`}
          onClick={() => onChange?.(v)}
        />
      ))}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-xl p-4 animate-pulse flex gap-3 items-center">
          <div className="w-10 h-10 rounded-full bg-[#E2E8F0] flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-[#E2E8F0] rounded w-1/3" />
            <div className="h-3 bg-[#E2E8F0] rounded w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${checked ? 'bg-[#1565C0]' : 'bg-[#CBD5E1]'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`}
      />
    </button>
  );
}

function Modal({
  editTarget,
  onClose,
  onSaved,
}: {
  editTarget: Testimoni | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormData>(
    editTarget
      ? {
          nama_klien: editTarget.nama_klien,
          isi_testimoni: editTarget.isi_testimoni,
          rating: editTarget.rating,
          lokasi: editTarget.lokasi ?? '',
          foto_url: editTarget.foto_url ?? '',
          jenis_transaksi: editTarget.jenis_transaksi ?? '',
          tampilkan: editTarget.tampilkan === 1,
          urutan: editTarget.urutan,
        }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof FormData, v: FormData[keyof FormData]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function handlePickFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // izinkan pilih file yang sama lagi
    if (!file) return;
    if (!file.type.startsWith('image/')) { setErr('File harus berupa gambar'); return; }
    setUploading(true);
    setErr(null);
    try {
      const base64 = await convertToWebP(file);
      const res = await fetch('/api/admin/testimonials/foto', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo: base64 }),
      });
      const json = await bacaJson(res);
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      set('foto_url', json.data?.key ?? '');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Gagal mengupload foto');
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        ...form,
        tampilkan: form.tampilkan ? 1 : 0,
        foto_url: form.foto_url || null,
        lokasi: form.lokasi || null,
        jenis_transaksi: form.jenis_transaksi || null,
      };
      if (editTarget) {
        await apiFetch(`/api/admin/testimonials/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/api/admin/testimonials', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Terjadi kesalahan');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-[#E2E8F0]">
          <h3 className="font-display font-bold text-[#0F172A]">
            {editTarget ? 'Edit Testimoni' : 'Tambah Testimoni'}
          </h3>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A] text-xl leading-none">×</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          {err && (
            <div className="flex gap-2 items-center text-red-600 bg-red-50 rounded-lg p-3 text-sm">
              <AlertCircle size={16} /> {err}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">Nama Klien *</label>
            <input
              required
              value={form.nama_klien}
              onChange={(e) => set('nama_klien', e.target.value)}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]/30"
              placeholder="Nama lengkap klien"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">Isi Testimoni *</label>
            <textarea
              required
              rows={4}
              value={form.isi_testimoni}
              onChange={(e) => set('isi_testimoni', e.target.value)}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]/30 resize-none"
              placeholder="Ceritakan pengalaman klien..."
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-2">Rating *</label>
            <StarRow rating={form.rating} onChange={(v) => set('rating', v)} />
            <span className="text-xs text-[#64748B] mt-1 inline-block">{form.rating} dari 5 bintang</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Lokasi</label>
              <input
                value={form.lokasi}
                onChange={(e) => set('lokasi', e.target.value)}
                className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]/30"
                placeholder="Kota, Provinsi"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Jenis Transaksi</label>
              <input
                value={form.jenis_transaksi}
                onChange={(e) => set('jenis_transaksi', e.target.value)}
                className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]/30"
                placeholder="Beli, KPR, Sewa…"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1">Foto Klien</label>
            <div className="flex items-start gap-3">
              {form.foto_url ? (
                <img
                  src={mediaSrc(form.foto_url)}
                  alt="Foto klien"
                  className="w-14 h-14 rounded-full object-cover border border-[#E2E8F0] flex-shrink-0 bg-[#F1F5F9]"
                  onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_AVATAR; }}
                />
              ) : (
                <div className="w-14 h-14 rounded-full border border-dashed border-[#CBD5E1] flex items-center justify-center text-[#94A3B8] flex-shrink-0">
                  <User size={20} />
                </div>
              )}
              <div className="flex-1 flex flex-col gap-1.5">
                <input
                  type="url"
                  value={form.foto_url}
                  onChange={(e) => set('foto_url', e.target.value)}
                  className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]/30"
                  placeholder="https://... atau upload file di bawah"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePickFoto}
                />
                <div className="flex gap-2 items-center">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="inline-flex items-center gap-1.5 border border-[#E2E8F0] text-[#475569] rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-[#F8FAFC] disabled:opacity-60 transition-colors"
                  >
                    {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    {uploading ? 'Mengupload…' : 'atau Upload File'}
                  </button>
                  {form.foto_url && !uploading && (
                    <button
                      type="button"
                      onClick={() => set('foto_url', '')}
                      className="text-xs text-red-600 hover:underline px-1"
                    >
                      Hapus
                    </button>
                  )}
                </div>
                <span className="text-[11px] text-[#94A3B8]">Tempel URL gambar (Unsplash, Drive, dll) atau upload file lokal (dikonversi ke WebP otomatis).</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Urutan</label>
              <input
                type="number"
                value={form.urutan}
                onChange={(e) => set('urutan', parseInt(e.target.value, 10) || 0)}
                className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]/30"
              />
            </div>
            <div className="flex flex-col justify-end">
              <label className="block text-xs font-semibold text-[#475569] mb-2">Tampilkan di Homepage</label>
              <ToggleSwitch checked={form.tampilkan} onChange={() => set('tampilkan', !form.tampilkan)} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-[#E2E8F0] text-[#475569] rounded-xl py-2 text-sm font-medium hover:bg-[#F8FAFC] transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-[#1565C0] text-white rounded-xl py-2 text-sm font-medium hover:bg-[#1251A3] disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {editTarget ? 'Simpan Perubahan' : 'Tambah'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminTestimoniPage() {
  const [items, setItems] = useState<Testimoni[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Testimoni | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch('/api/admin/testimonials');
      setItems(data.items ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal memuat testimoni');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  function openAdd() { setEditTarget(null); setModalOpen(true); }
  function openEdit(t: Testimoni) { setEditTarget(t); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditTarget(null); }
  function handleSaved() { closeModal(); loadList(); }

  async function toggleTampilkan(item: Testimoni) {
    const next = item.tampilkan === 1 ? 0 : 1;
    // Optimistic update
    setItems((prev) => prev.map((t) => t.id === item.id ? { ...t, tampilkan: next } : t));
    try {
      await apiFetch(`/api/admin/testimonials/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ tampilkan: next }),
      });
    } catch {
      // Revert
      setItems((prev) => prev.map((t) => t.id === item.id ? { ...t, tampilkan: item.tampilkan } : t));
    }
  }

  async function handleDelete() {
    if (confirmId === null) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/testimonials/${confirmId}`, { method: 'DELETE' });
      setConfirmId(null);
      loadList();
    } catch {
      // keep dialog open so user sees it failed
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">Testimoni</h1>
          <p className="text-[#64748B] text-sm mt-0.5">Kelola ulasan klien yang tampil di homepage</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-[#1565C0] text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-[#1251A3] transition-colors"
        >
          <Plus size={16} /> Tambah Testimoni
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <Skeleton />
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex gap-3 items-center text-red-700 text-sm">
          <AlertCircle size={18} /> {error}
          <button onClick={loadList} className="ml-auto underline text-xs">Coba lagi</button>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center text-[#64748B] text-sm">
          Belum ada testimoni. Klik <strong>Tambah Testimoni</strong> untuk memulai.
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] w-12">#</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Klien</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Rating</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] min-w-[200px]">Testimoni</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Transaksi</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#64748B]">Tampil</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#64748B]">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {items.map((t) => (
                  <tr key={t.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-4 py-3 text-[#94A3B8] text-xs">{t.urutan}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={mediaSrc(t.foto_url)}
                          alt={t.nama_klien}
                          className="w-9 h-9 rounded-full object-cover bg-[#E2E8F0] flex-shrink-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = FALLBACK_AVATAR;
                          }}
                        />
                        <div>
                          <div className="font-medium text-[#0F172A]">{t.nama_klien}</div>
                          {t.lokasi && <div className="text-[#94A3B8] text-xs">{t.lokasi}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StarRow rating={t.rating} />
                    </td>
                    <td className="px-4 py-3 text-[#475569]">
                      {t.isi_testimoni.length > 80
                        ? `${t.isi_testimoni.slice(0, 80)}…`
                        : t.isi_testimoni}
                    </td>
                    <td className="px-4 py-3">
                      {t.jenis_transaksi ? (
                        <span className="px-2 py-0.5 bg-[#E3F2FD] text-[#1565C0] text-xs rounded-full font-medium">
                          {t.jenis_transaksi}
                        </span>
                      ) : (
                        <span className="text-[#CBD5E1]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <ToggleSwitch
                          checked={t.tampilkan === 1}
                          onChange={() => toggleTampilkan(t)}
                        />
                        {t.tampilkan === 1
                          ? <Eye size={12} className="text-[#1565C0]" />
                          : <EyeOff size={12} className="text-[#94A3B8]" />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEdit(t)}
                          className="p-1.5 rounded-lg text-[#64748B] hover:bg-[#E3F2FD] hover:text-[#1565C0] transition-colors"
                          title="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setConfirmId(t.id)}
                          className="p-1.5 rounded-lg text-[#64748B] hover:bg-red-50 hover:text-red-600 transition-colors"
                          title="Hapus"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-[#F1F5F9] text-xs text-[#94A3B8]">
            {items.length} testimoni · {items.filter((t) => t.tampilkan === 1).length} ditampilkan
          </div>
        </div>
      )}

      {/* Modal form */}
      {modalOpen && (
        <Modal editTarget={editTarget} onClose={closeModal} onSaved={handleSaved} />
      )}

      {/* Confirm delete dialog */}
      {confirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="font-display font-bold text-[#0F172A] mb-2">Hapus Testimoni?</h3>
            <p className="text-[#64748B] text-sm mb-5">
              Testimoni ini akan dihapus permanen dan tidak bisa dikembalikan.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmId(null)}
                className="flex-1 border border-[#E2E8F0] text-[#475569] rounded-xl py-2 text-sm font-medium hover:bg-[#F8FAFC]"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
