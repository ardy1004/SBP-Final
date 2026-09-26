import type { CSSProperties, HTMLAttributes, Ref } from 'react';
import { X, Star } from 'lucide-react';

/** Satu foto yang dipilih di form Titip Jual, sebelum dikirim. */
export interface FotoLokal {
  /** ID tetap per foto. BUKAN index (bergeser saat diurutkan) dan BUKAN dataUrl
   *  (foto yang sama bisa dipilih dua kali → id kembar). */
  id: string;
  preview: string;
}

interface KartuFotoProps {
  src: string;
  utama: boolean;
  onHapus: () => void;
  onJadikanUtama: () => void;
  // Diisi GridFotoSortable; kosong di grid biasa (fallback tanpa dnd-kit).
  nodeRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  seretProps?: HTMLAttributes<HTMLDivElement>;
  sedangDiseret?: boolean;
}

// SENGAJA tanpa import @dnd-kit: berkas ini dipakai langsung oleh TitipJualPage
// (bundle SSR eager). dnd-kit hanya ada di GridFotoSortable yang dimuat belakangan.
export default function KartuFoto({ src, utama, onHapus, onJadikanUtama, nodeRef, style, seretProps, sedangDiseret }: KartuFotoProps) {
  return (
    <div
      ref={nodeRef}
      style={style}
      {...seretProps}
      // select-none + callout:none: tekan-tahan untuk menyeret di HP tidak boleh
      // memunculkan menu "Simpan gambar" iOS. touch-manipulation (BUKAN touch-none):
      // scroll yang dimulai di atas foto harus tetap jalan.
      className={`relative aspect-square rounded-lg overflow-hidden border-2 select-none touch-manipulation [-webkit-touch-callout:none] ${
        utama ? 'border-[#1565C0]' : 'border-gray-200'
      } ${sedangDiseret ? 'opacity-60 z-10 shadow-lg' : ''}`}
    >
      <img src={src} alt="" draggable={false} className="w-full h-full object-cover pointer-events-none" suppressHydrationWarning />
      {utama ? (
        <span className="absolute top-1 left-1 bg-[#1565C0] text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">Utama</span>
      ) : (
        <button
          type="button"
          onClick={onJadikanUtama}
          aria-label="Jadikan foto utama"
          title="Jadikan foto utama"
          className="absolute top-1 left-1 z-10 w-6 h-6 bg-black/60 hover:bg-[#1565C0] rounded-full flex items-center justify-center transition-colors"
        >
          <Star size={12} className="text-white" />
        </button>
      )}
      <button
        type="button"
        onClick={onHapus}
        aria-label="Hapus foto"
        className="absolute top-1 right-1 z-10 w-6 h-6 bg-black/60 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors"
      >
        <X size={11} className="text-white" />
      </button>
    </div>
  );
}
