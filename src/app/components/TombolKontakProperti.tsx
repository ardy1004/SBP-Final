import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { bukaWaProperti, catatBukaForm, type PropertiWa } from '../../lib/waProperty';

// Dua jalur konversi berdampingan, dipakai di DUA titik masuk halaman detail
// properti: kartu CTA inline dan sticky bar. Sengaja satu komponen — markup yang
// disalin ke dua tempat menyimpang diam-diam, dan di repo ini pola itu sudah
// memakan korban (lihat alasan lahirnya `check:turnstile`).
//
// KENAPA "Chat WA Sekarang" ADA (keputusan user 8 Sep 2026, merevisi 2 Sep 2026):
// sampai sekarang KEDUA tombol hanya membuka ContactAdminSheet, yang menuntut 6
// field wajib + Turnstile sebelum pengunjung boleh bicara. Untuk trafik iklan
// dingin itu terlalu berat: 6.470 tayangan properti menghasilkan 1 klik WA
// (0,015%; wajar 1–3%). Jalur cepat tidak menghapus form — ia berdampingan,
// jadi lead beridentitas tetap bisa masuk lewat tombol sebelahnya.

interface Props {
  property: PropertiWa;
  /** Buka ContactAdminSheet (alur lama, tidak berubah). */
  onIsiForm: () => void;
  className?: string;
}

export default function TombolKontakProperti({ property, onIsiForm, className = '' }: Props) {
  const [membuka, setMembuka] = useState(false);

  const chatLangsung = () => {
    if (membuka) return;
    setMembuka(true);
    // Tidak di-reset: `bukaWaProperti` selalu berujung navigasi keluar halaman.
    // Me-reset-nya justru membuka celah klik ganda saat jaringan lambat.
    void bukaWaProperti(property);
  };

  return (
    <div className={`flex gap-2 ${className}`}>
      <button
        onClick={chatLangsung}
        disabled={membuka}
        className="flex-1 flex flex-col items-center justify-center px-3 py-2.5 rounded-xl font-bold text-white bg-[#10B981] hover:bg-[#059669] disabled:opacity-70 transition-colors"
      >
        <span className="flex items-center gap-1.5 text-sm leading-tight">
          <MessageCircle size={16} /> {membuka ? 'Membuka…' : 'Chat WA Sekarang'}
        </span>
        <span className="text-[10px] font-normal text-white/75 leading-tight mt-0.5">
          Tanpa isi form
        </span>
      </button>

      <button
        onClick={() => { catatBukaForm(property.slug); onIsiForm(); }}
        className="flex-1 flex flex-col items-center justify-center px-3 py-2.5 rounded-xl font-semibold text-[#1565C0] bg-white border border-[#1565C0] hover:bg-blue-50 transition-colors"
      >
        <span className="text-sm leading-tight">Isi Form Dulu</span>
        <span className="text-[10px] font-normal text-[#64748B] leading-tight mt-0.5">
          Dapat info lengkap
        </span>
      </button>
    </div>
  );
}
