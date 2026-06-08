import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Loader2, AlertCircle, Eye, EyeOff, ExternalLink } from 'lucide-react';

interface BlogAdminItem {
  id: number;
  judul: string;
  slug: string;
  kategori: string | null;
  status: string;
  published_at: string | null;
  created_at: string;
}

type FormData = {
  judul: string;
  konten: string;
  excerpt: string;
  kategori: string;
  tags: string;
  cover: string;
  status: 'draft' | 'published';
  meta_title: string;
  meta_description: string;
};

const EMPTY_FORM: FormData = {
  judul: '', konten: '', excerpt: '', kategori: '', tags: '', cover: '',
  status: 'draft', meta_title: '', meta_description: '',
};

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data;
}

const STATUS_BADGE: Record<string, string> = {
  published: 'bg-emerald-100 text-emerald-700',
  draft: 'bg-slate-100 text-slate-500',
  scheduled: 'bg-amber-100 text-amber-700',
};

function Modal({ editId, onClose, onSaved }: { editId: number | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [loading, setLoading] = useState(editId !== null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof FormData, v: FormData[keyof FormData]) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (editId === null) return;
    setLoading(true);
    apiFetch(`/api/admin/blog/${editId}`)
      .then(d => {
        const p = d.data;
        setForm({
          judul: p.judul ?? '',
          konten: p.konten ?? '',
          excerpt: p.excerpt ?? '',
          kategori: p.kategori ?? '',
          tags: Array.isArray(p.tags) ? p.tags.join(', ') : '',
          cover: p.cover ?? '',
          status: p.status === 'published' ? 'published' : 'draft',
          meta_title: p.meta_title ?? '',
          meta_description: p.meta_description ?? '',
        });
      })
      .catch(e => setErr(e instanceof Error ? e.message : 'Gagal memuat artikel'))
      .finally(() => setLoading(false));
  }, [editId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        judul: form.judul,
        konten: form.konten,
        excerpt: form.excerpt || undefined,
        kategori: form.kategori || undefined,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        cover: form.cover || undefined,
        status: form.status,
        meta_title: form.meta_title || undefined,
        meta_description: form.meta_description || undefined,
      };
      if (editId !== null) {
        await apiFetch(`/api/admin/blog/${editId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/api/admin/blog', { method: 'POST', body: JSON.stringify(payload) });
      }
      onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Terjadi kesalahan');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]/30";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-[#E2E8F0] sticky top-0 bg-white">
          <h3 className="font-display font-bold text-[#0F172A]">{editId !== null ? 'Edit Artikel' : 'Tulis Artikel Baru'}</h3>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A] text-xl leading-none">×</button>
        </div>

        {loading ? (
          <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[#1565C0]" /></div>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-4">
            {err && (
              <div className="flex gap-2 items-center text-red-600 bg-red-50 rounded-lg p-3 text-sm">
                <AlertCircle size={16} /> {err}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Judul *</label>
              <input required value={form.judul} onChange={e => set('judul', e.target.value)} className={inputCls} placeholder="Judul artikel" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Kategori</label>
                <input value={form.kategori} onChange={e => set('kategori', e.target.value)} className={inputCls} placeholder="KPR, Investasi, Panduan…" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Tags (pisah koma)</label>
                <input value={form.tags} onChange={e => set('tags', e.target.value)} className={inputCls} placeholder="kpr, tips, jogja" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">URL Cover</label>
              <input value={form.cover} onChange={e => set('cover', e.target.value)} type="url" className={inputCls} placeholder="https://..." />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Excerpt (ringkasan)</label>
              <textarea rows={2} value={form.excerpt} onChange={e => set('excerpt', e.target.value)} className={`${inputCls} resize-none`} placeholder="Ringkasan singkat untuk card & SEO" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#475569] mb-1">Konten (HTML diperbolehkan)</label>
              <textarea rows={12} value={form.konten} onChange={e => set('konten', e.target.value)} className={`${inputCls} font-mono text-xs`} placeholder="<p>Tulis isi artikel di sini…</p>" />
            </div>

            <details className="border border-[#E2E8F0] rounded-lg p-3">
              <summary className="text-xs font-semibold text-[#475569] cursor-pointer">SEO (opsional)</summary>
              <div className="space-y-3 mt-3">
                <input value={form.meta_title} onChange={e => set('meta_title', e.target.value)} className={inputCls} placeholder="Meta title" />
                <textarea rows={2} value={form.meta_description} onChange={e => set('meta_description', e.target.value)} className={`${inputCls} resize-none`} placeholder="Meta description" />
              </div>
            </details>

            <div className="flex items-center gap-3">
              <label className="block text-xs font-semibold text-[#475569]">Status</label>
              <div className="flex gap-2">
                {(['draft', 'published'] as const).map(s => (
                  <button key={s} type="button" onClick={() => set('status', s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      form.status === s ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'border-gray-200 text-gray-600 hover:border-[#1565C0]'
                    }`}>
                    {s === 'draft' ? 'Draft' : 'Published'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 border border-[#E2E8F0] text-[#475569] rounded-xl py-2 text-sm font-medium hover:bg-[#F8FAFC] transition-colors">Batal</button>
              <button type="submit" disabled={saving} className="flex-1 bg-[#1565C0] text-white rounded-xl py-2 text-sm font-medium hover:bg-[#1251A3] disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editId !== null ? 'Simpan Perubahan' : 'Simpan Artikel'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function AdminBlogPage() {
  const [items, setItems] = useState<BlogAdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch('/api/admin/blog');
      setItems(data.data?.items ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal memuat artikel');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  function openAdd() { setEditId(null); setModalOpen(true); }
  function openEdit(id: number) { setEditId(id); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditId(null); }
  function handleSaved() { closeModal(); loadList(); }

  async function togglePublish(item: BlogAdminItem) {
    const next = item.status === 'published' ? 'draft' : 'published';
    setItems(prev => prev.map(p => p.id === item.id ? { ...p, status: next } : p));
    try {
      await apiFetch(`/api/admin/blog/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      loadList();
    } catch {
      setItems(prev => prev.map(p => p.id === item.id ? { ...p, status: item.status } : p));
    }
  }

  async function handleDelete() {
    if (confirmId === null) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/blog/${confirmId}`, { method: 'DELETE' });
      setConfirmId(null);
      loadList();
    } catch { /* keep dialog */ } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">Blog</h1>
          <p className="text-[#64748B] text-sm mt-0.5">Kelola artikel & tips properti</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-[#1565C0] text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-[#1251A3] transition-colors">
          <Plus size={16} /> Tulis Artikel
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="bg-white rounded-xl p-4 animate-pulse h-14" />)}
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex gap-3 items-center text-red-700 text-sm">
          <AlertCircle size={18} /> {error}
          <button onClick={loadList} className="ml-auto underline text-xs">Coba lagi</button>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center text-[#64748B] text-sm">
          Belum ada artikel. Klik <strong>Tulis Artikel</strong> untuk memulai.
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] min-w-[240px]">Judul</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Kategori</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#64748B]">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B]">Dibuat</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#64748B]">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {items.map(p => (
                  <tr key={p.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#0F172A] line-clamp-1">{p.judul}</div>
                      <div className="text-[#94A3B8] text-xs">/{p.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      {p.kategori ? (
                        <span className="px-2 py-0.5 bg-[#E3F2FD] text-[#1565C0] text-xs rounded-full font-medium">{p.kategori}</span>
                      ) : <span className="text-[#CBD5E1]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => togglePublish(p)} title="Klik untuk toggle publish"
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[p.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {p.status === 'published' ? <Eye size={11} /> : <EyeOff size={11} />}
                        {p.status}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-[#94A3B8] text-xs">{p.created_at?.slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {p.status === 'published' && (
                          <a href={`/blog/${p.slug}`} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-[#64748B] hover:bg-[#E3F2FD] hover:text-[#1565C0] transition-colors" title="Lihat">
                            <ExternalLink size={15} />
                          </a>
                        )}
                        <button onClick={() => openEdit(p.id)} className="p-1.5 rounded-lg text-[#64748B] hover:bg-[#E3F2FD] hover:text-[#1565C0] transition-colors" title="Edit">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => setConfirmId(p.id)} className="p-1.5 rounded-lg text-[#64748B] hover:bg-red-50 hover:text-red-600 transition-colors" title="Hapus">
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
            {items.length} artikel · {items.filter(p => p.status === 'published').length} published
          </div>
        </div>
      )}

      {modalOpen && <Modal editId={editId} onClose={closeModal} onSaved={handleSaved} />}

      {confirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="font-display font-bold text-[#0F172A] mb-2">Hapus Artikel?</h3>
            <p className="text-[#64748B] text-sm mb-5">Artikel ini akan dihapus permanen dan tidak bisa dikembalikan.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmId(null)} className="flex-1 border border-[#E2E8F0] text-[#475569] rounded-xl py-2 text-sm font-medium hover:bg-[#F8FAFC]">Batal</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 bg-red-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2">
                {deleting && <Loader2 size={14} className="animate-spin" />} Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
