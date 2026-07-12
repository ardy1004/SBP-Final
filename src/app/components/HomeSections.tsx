import { useState } from 'react';
import { Link } from 'react-router';
import { Search, ArrowRight, Home, ChevronDown, ChevronUp } from 'lucide-react';

export interface CoverageArea {
  kecamatan: string;
  kabupaten: string;
  provinsi: string;
  cnt: number;
}

// ── DUAL CTA ──────────────────────────────────────────────────────────────────
export function DualCTASection({ statPublished }: { statPublished: number }) {
  return (
    <section className="py-12 bg-[#F0F9FF]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-gradient-to-br from-[#0B2447] to-[#1565C0] p-8 flex flex-col justify-between min-h-[220px]">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-white text-xs font-semibold mb-4">
                🏠 {statPublished > 0 ? `${statPublished}+ Listing Tersedia` : 'Listing Tersedia'}
              </div>
              <h2 className="font-display text-2xl font-bold text-white mb-2">Cari Properti Impian</h2>
              <p className="text-white/70 text-sm">Jelajahi ratusan listing properti terverifikasi di Yogyakarta.</p>
            </div>
            <Link
              to="/properties"
              className="mt-6 inline-flex items-center gap-2 bg-white text-[#0B2447] font-semibold px-5 py-2.5 rounded-xl self-start text-sm hover:bg-[#E3F2FD] transition-colors"
            >
              <Search size={15} /> Cari Sekarang
            </Link>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-[#047857] to-[#10B981] p-8 flex flex-col justify-between min-h-[220px]">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-white text-xs font-semibold mb-4">
                📋 Gratis &amp; Tanpa Biaya Awal
              </div>
              <h2 className="font-display text-2xl font-bold text-white mb-2">Titip Jual Properti</h2>
              <p className="text-white/70 text-sm">Pasarkan properti Anda ke ribuan calon pembeli yang serius.</p>
            </div>
            <Link
              to="/titip-jual"
              className="mt-6 inline-flex items-center gap-2 bg-white text-[#047857] font-semibold px-5 py-2.5 rounded-xl self-start text-sm hover:bg-[#ECFDF5] transition-colors"
            >
              <Home size={15} /> Titip Jual Sekarang
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── COVERAGE AREA ─────────────────────────────────────────────────────────────
export function CoverageAreaSection({ areas }: { areas: CoverageArea[] }) {
  if (areas.length === 0) return null;
  return (
    <section className="py-14 bg-[#F8FAFC]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h2 className="font-display text-3xl font-bold text-[#0F172A]">Jangkauan Area SBP</h2>
          <p className="text-[#64748B] mt-2 text-sm">Kami melayani berbagai kecamatan di Yogyakarta</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          {areas.map(a => (
            <Link
              key={a.kecamatan}
              to={`/properties?kecamatan=${encodeURIComponent(a.kecamatan)}&kabupaten=${encodeURIComponent(a.kabupaten)}`}
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-[#CBD5E1] bg-white text-[#334155] text-sm font-medium hover:border-[#1565C0] hover:text-[#1565C0] hover:bg-[#EFF6FF] transition-all"
            >
              📍 {a.kecamatan}
              <span className="bg-[#E2E8F0] text-[#475569] text-xs px-1.5 py-0.5 rounded-full">{a.cnt}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── CONSULTATION CTA ─────────────────────────────────────────────────────────
export function ConsultationCTASection({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="py-10 bg-[#F0F9FF]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl bg-gradient-to-r from-[#0B2447] to-[#1565C0] px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-5">
          <div>
            <p className="text-white/70 text-sm mb-1">Tidak menemukan yang sesuai?</p>
            <h3 className="font-display text-xl font-bold text-white">Ceritakan Kebutuhan Properti Anda</h3>
            <p className="text-white/60 text-sm mt-1">Tim SBP siap membantu — gratis, tanpa komitmen.</p>
          </div>
          <button
            onClick={onOpen}
            className="flex-shrink-0 inline-flex items-center gap-2 bg-white text-[#0B2447] font-semibold px-6 py-3 rounded-xl text-sm hover:bg-[#E3F2FD] transition-colors whitespace-nowrap"
          >
            💬 Konsultasi Sekarang
          </button>
        </div>
      </div>
    </section>
  );
}

// ── HOME FAQ ──────────────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    q: 'Apakah ada biaya untuk mencari properti di SBP?',
    a: 'Sama sekali tidak ada biaya untuk calon pembeli. Anda bisa mencari, melihat detail, dan menghubungi kami sepenuhnya gratis. Fee hanya berlaku untuk pemilik properti yang menggunakan jasa pemasaran SBP.',
  },
  {
    q: 'Bagaimana cara memasarkan properti saya melalui SBP?',
    a: 'Kunjungi halaman "Titip Jual", isi data diri (Step 1) dan informasi properti (Step 2), lalu kirim. Tim SBP akan menghubungi Anda dalam 1×24 jam untuk proses selanjutnya termasuk penandatanganan perjanjian digital.',
  },
  {
    q: 'Apakah informasi properti di SBP akurat dan terpercaya?',
    a: 'Ya. Setiap properti dengan badge "Terverifikasi SBP" telah melalui proses pengecekan langsung: legalitas sertifikat dilihat, lokasi dikonfirmasi, foto asli (bukan foto stok), dan harga wajar. Kami berkomitmen pada transparansi penuh.',
  },
  {
    q: 'Bagaimana cara menghubungi pemilik properti?',
    a: 'Buka halaman detail properti yang Anda minati, lalu klik tombol "Hubungi Admin Via WA" di bagian bawah layar. Sebuah form singkat akan muncul — isi nama, nomor WA, dan kebutuhan Anda, lalu klik "Hubungi via WhatsApp". Data Anda tersimpan otomatis dan tim SBP akan segera merespons.',
  },
];

export function HomeFAQSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <section className="py-16 bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="font-display text-3xl font-bold text-[#0F172A]">Pertanyaan Umum</h2>
          <p className="text-[#64748B] mt-2 text-sm">Jawaban atas pertanyaan yang sering diajukan</p>
        </div>
        <div className="space-y-3">
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className="rounded-xl border border-[#E2E8F0] overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-5 py-4 text-left bg-white hover:bg-[#F8FAFC] transition-colors"
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
                aria-expanded={openIdx === i}
              >
                <span className="font-semibold text-[#0F172A] text-sm pr-4">{item.q}</span>
                {openIdx === i
                  ? <ChevronUp size={16} className="text-[#64748B] flex-shrink-0" />
                  : <ChevronDown size={16} className="text-[#64748B] flex-shrink-0" />}
              </button>
              {openIdx === i && (
                <div className="px-5 pb-4 text-sm text-[#475569] bg-white leading-relaxed">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link
            to="/faq"
            className="inline-flex items-center gap-2 text-[#1565C0] font-semibold text-sm hover:text-[#1E88E5] transition-colors"
          >
            Lihat Semua FAQ <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </section>
  );
}
