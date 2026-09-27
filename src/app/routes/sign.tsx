// Route /sign/:token — client-only. Lihat src/app/lib/clientOnly.tsx.
//
// SSR halaman ini memang hanya pernah merender "Memuat dokumen perjanjian…":
// SignPage mulai di state 'loading' dan mengambil dokumen (ber-NIK) lewat fetch
// di browser. Seluruh ±31 KB kodenya (dokumen, slot TTD, halaman sukses) karenanya
// percuma di chunk SSR — kini dimuat di browser saja.
//
// MemuatDokumen = salinan LoadingView di SignPage.tsx, sengaja DITULIS ULANG di
// sini: mengimpornya dari SignPage akan menyeret SignPage kembali ke chunk SSR.
// Wajib deterministik (tanpa Date/window/localStorage) — lihat clientOnly.tsx.
import { Loader2 } from 'lucide-react';
import { clientOnly, MODUL_KOSONG } from '../lib/clientOnly';

function MemuatDokumen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F0F4F8' }}>
      <div className="text-center">
        <Loader2 size={40} className="text-[#1565C0] mx-auto mb-4 animate-spin" />
        <p className="text-[#64748B]">Memuat dokumen perjanjian…</p>
      </div>
    </div>
  );
}

export default clientOnly(
  () => import.meta.env.SSR ? MODUL_KOSONG : import('../components/SignPage'),
  MemuatDokumen,
);
