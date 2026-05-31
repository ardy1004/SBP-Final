import { Link } from 'react-router';
import { Shield, FileText, Scale, CheckCircle, MessageCircle } from 'lucide-react';

export default function NotarisPage() {
  const faqs = [
    { q: 'Apa fungsi notaris dalam jual beli properti?', a: 'Notaris/PPAT berfungsi sebagai pejabat yang berwenang membuat akta jual beli (AJB), akta peralihan hak, dan dokumen hukum lainnya. Keberadaannya memastikan transaksi properti sah secara hukum.' },
    { q: 'Berapa biaya notaris untuk jual beli rumah?', a: 'Biaya notaris bervariasi tergantung nilai transaksi dan lokasi. Umumnya antara 0.5%–1% dari harga transaksi. Tim SBP akan membantu estimasi biaya sebelum proses dimulai.' },
    { q: 'Apa itu AJB (Akta Jual Beli)?', a: 'AJB adalah dokumen resmi yang dibuat di hadapan notaris/PPAT yang menyatakan peralihan hak kepemilikan properti dari penjual ke pembeli. AJB merupakan syarat untuk proses balik nama sertifikat.' },
    { q: 'Bagaimana cara cek keaslian sertifikat SHM?', a: 'Anda dapat mengecek keaslian sertifikat melalui: (1) Kantor BPN setempat untuk cek data fisik sertifikat, (2) Aplikasi Sentuh Tanahku dari BPN, (3) Melalui notaris rekanan yang berpengalaman.' },
    { q: 'Apa perbedaan SHM dan SHGB?', a: 'SHM (Sertifikat Hak Milik) adalah kepemilikan penuh tanpa batas waktu — paling kuat. SHGB (Sertifikat Hak Guna Bangunan) memiliki masa berlaku tertentu (biasanya 30 tahun) dan dapat diperpanjang. Bangunan di atas tanah negara atau tanah orang lain menggunakan SHGB.' },
  ];

  return (
    <div className="pt-16">
      <section className="py-16" style={{ background: 'linear-gradient(160deg, #0B2447 0%, #1565C0 100%)' }}>
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="font-display text-4xl font-bold text-white mb-3">Layanan Notaris & Legalitas</h1>
          <p className="text-white/70">Panduan lengkap proses hukum dan peran notaris dalam transaksi properti</p>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
            <div>
              <h2 className="font-display text-2xl font-bold text-[#0F172A] mb-4">Peran Notaris dalam Properti</h2>
              <p className="text-[#64748B] leading-relaxed mb-4">
                Notaris/PPAT (Pejabat Pembuat Akta Tanah) adalah pejabat yang berwenang membuat dokumen hukum resmi untuk transaksi properti. SBP bekerja sama dengan notaris dan PPAT terpercaya di Yogyakarta untuk memastikan setiap transaksi aman dan sah secara hukum.
              </p>
              <div className="space-y-3">
                {[
                  { icon: FileText, text: 'Pembuatan Akta Jual Beli (AJB)' },
                  { icon: CheckCircle, text: 'Verifikasi dan pengecekan sertifikat di BPN' },
                  { icon: Scale, text: 'Proses balik nama sertifikat (HT)' },
                  { icon: Shield, text: 'Pembuatan SKMHT/APHT untuk KPR' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-3 text-sm text-[#64748B]">
                    <Icon size={16} className="text-[#1565C0] flex-shrink-0" />
                    {text}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="font-display text-2xl font-bold text-[#0F172A] mb-4">Alur Proses Jual Beli</h2>
              <div className="space-y-3">
                {[
                  { step: 1, title: 'Pengecekan Sertifikat', desc: 'Verifikasi keaslian dan status sertifikat di BPN' },
                  { step: 2, title: 'Penandatanganan PPJB', desc: 'Perjanjian Pengikatan Jual Beli (opsional)' },
                  { step: 3, title: 'Pembayaran & AJB', desc: 'Pelunasan harga + penandatanganan AJB di hadapan PPAT' },
                  { step: 4, title: 'Balik Nama', desc: 'Pengajuan balik nama sertifikat ke BPN (±2–4 minggu)' },
                  { step: 5, title: 'Sertifikat Baru', desc: 'Penerimaan sertifikat atas nama pembeli' },
                ].map(s => (
                  <div key={s.step} className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#1565C0] text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{s.step}</div>
                    <div>
                      <div className="font-semibold text-[#0F172A] text-sm">{s.title}</div>
                      <div className="text-xs text-[#64748B]">{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* FAQ */}
          <h2 className="font-display text-2xl font-bold text-[#0F172A] mb-6">FAQ Legalitas</h2>
          <div className="space-y-4 mb-12">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-[#F0F4F8] rounded-xl p-5">
                <h3 className="font-semibold text-[#0F172A] text-sm mb-2">Q: {faq.q}</h3>
                <p className="text-[#64748B] text-sm">A: {faq.a}</p>
              </div>
            ))}
          </div>

          <div className="bg-[#E3F2FD] rounded-2xl p-8 text-center">
            <h3 className="font-display font-bold text-xl text-[#0F172A] mb-3">Butuh Bantuan Legalitas?</h3>
            <p className="text-[#64748B] mb-6">Konsultasikan proses legalitas properti Anda dengan tim SBP</p>
            <a href="https://wa.me/6281391278889?text=Halo SBP, saya ingin konsultasi legalitas properti"
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-[#10B981] hover:bg-[#059669] transition-colors">
              <MessageCircle size={18} /> Konsultasi via WhatsApp
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
