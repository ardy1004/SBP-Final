import { useState } from 'react';
import { PHOTO_LABELS, slugifyLabel } from './options';
import { cfImg } from '../../../../lib/img';

export interface LabelFotoImage {
  id: number;
  url_webp: string;
  label_ruangan?: string | null;
}

function thumbSrc(url: string, width: number): string {
  return cfImg(`/api/media?key=${encodeURIComponent(url)}`, width);
}

/** Nama file ZIP per foto: label unik → "fasad.webp"; label dengan >1 foto →
 *  "fasad1.webp", "fasad2.webp" (urutan sesuai urutan foto). */
function buildZipNames(images: LabelFotoImage[]): Map<number, string> {
  const groups = new Map<string, LabelFotoImage[]>();
  for (const im of images) {
    const label = (im.label_ruangan ?? '').trim();
    if (!label) continue;
    const arr = groups.get(label) ?? [];
    arr.push(im);
    groups.set(label, arr);
  }
  const names = new Map<number, string>();
  for (const [label, arr] of groups) {
    const slug = slugifyLabel(label);
    arr.forEach((im, i) => {
      names.set(im.id, arr.length > 1 ? `${slug}${i + 1}.webp` : `${slug}.webp`);
    });
  }
  return names;
}

interface Props {
  images: LabelFotoImage[];
  kodeListing: string;
  onSaveLabel: (photoId: number, label: string) => void;
  selectedIds: Set<number>;
  onToggleSelected: (photoId: number) => void;
}

// Judul & tombol navigasi SENGAJA tidak ada di sini — sejak wizard jadi accordion
// (semua step bertumpuk di satu halaman), header bernomor dan tombol Lanjut
// disediakan oleh <Section> pembungkus di AdminViralFrameWorkspacePage.
export default function LabelFotoStep({ images, kodeListing, onSaveLabel, selectedIds, onToggleSelected }: Props) {
  const [zipBusy, setZipBusy] = useState(false);
  const [zipError, setZipError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);

  const labeledCount = images.filter(im => im.label_ruangan?.trim()).length;
  const canDownloadZip = labeledCount > 0 && !zipBusy;

  const handleDownloadZip = async () => {
    setZipBusy(true); setZipError('');
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const names = buildZipNames(images);
      for (const im of images) {
        const name = names.get(im.id);
        if (!name) continue; // belum berlabel — tidak ikut ZIP
        const res = await fetch(`/api/admin/media?key=${encodeURIComponent(im.url_webp)}`, { credentials: 'include' });
        if (!res.ok) throw new Error(`Gagal unduh foto (HTTP ${res.status})`);
        const blob = await res.blob();
        zip.file(name, blob);
      }
      const out = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(kodeListing || 'SBP').replace(/[^a-zA-Z0-9-]/g, '-')}-foto-berlabel.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setZipError(err instanceof Error ? err.message : 'Gagal membuat ZIP');
    } finally {
      setZipBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#64748B]">
        Identifikasi tiap foto (Fasad, Dapur, Kamar Tidur, dst). Foto belum teridentifikasi ditandai merah.
        Setelah itu, centang foto mana saja yang jadi bahan video ini.
      </p>

      {images.length === 0 ? (
        <div className="text-center py-10 text-[#94A3B8] text-sm">Belum ada foto untuk properti ini.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map(im => {
            const labeled = !!im.label_ruangan?.trim();
            const src = thumbSrc(im.url_webp, 240);
            const selected = selectedIds.has(im.id);
            return (
              <div key={im.id} className={`relative rounded-xl overflow-hidden border-2 ${selected ? 'border-[#1565C0]' : 'border-gray-100'}`}>
                <img src={src} alt="" className="w-full aspect-square object-cover" loading="lazy" />

                {!labeled && editingId !== im.id && (
                  <button type="button" onClick={() => setEditingId(im.id)}
                    className="absolute inset-0 bg-red-600/70 flex items-center justify-center text-white text-xs font-semibold text-center px-2">
                    Belum teridentifikasi — klik untuk label
                  </button>
                )}

                {editingId === im.id && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-2">
                    <select
                      autoFocus
                      defaultValue={im.label_ruangan ?? ''}
                      onChange={e => { onSaveLabel(im.id, e.target.value); setEditingId(null); }}
                      onBlur={() => setEditingId(null)}
                      className="w-full text-xs px-2 py-1.5 rounded-lg border-0 outline-none"
                    >
                      <option value="">— Pilih label —</option>
                      {PHOTO_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                )}

                <label className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-white/90 rounded-md px-1.5 py-0.5 cursor-pointer">
                  <input type="checkbox" checked={selected} onChange={() => onToggleSelected(im.id)} className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-medium text-[#0F172A]">Bahan</span>
                </label>

                {labeled && (
                  <button type="button" onClick={() => setEditingId(im.id)}
                    className="absolute bottom-0 inset-x-0 bg-white/90 text-[11px] text-[#0F172A] py-1 px-1.5 text-center truncate hover:bg-white">
                    {im.label_ruangan}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
        <button type="button" onClick={handleDownloadZip} disabled={!canDownloadZip}
          className="px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 text-[#0F172A] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50">
          {zipBusy ? 'Menyiapkan ZIP…' : '⬇️ Download ZIP Foto Berlabel'}
        </button>
        {zipError && <span className="text-xs text-red-600">{zipError}</span>}
        <div className="flex-1" />
        <span className="text-xs text-[#94A3B8]">{selectedIds.size} foto terpilih jadi bahan</span>
      </div>
    </div>
  );
}
