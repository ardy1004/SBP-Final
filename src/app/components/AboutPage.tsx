import { Link } from 'react-router';
import { Shield, CheckCircle, Scale, Handshake, ArrowRight, Star } from 'lucide-react';
import { useContactEmail } from './useContactEmail';

export default function AboutPage() {
  const { display: emailDisplay } = useContactEmail();
  return (
    <div className="pt-16">
      {/* Hero */}
      <section className="py-20" style={{ background: 'linear-gradient(160deg, #0B2447 0%, #1565C0 100%)' }}>
        <div className="max-w-4xl mx-auto px-4 text-center">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold text-[#29B6F6] bg-white/10 mb-4">TENTANG KAMI</span>
          <h1 className="font-display text-4xl font-bold text-white mb-4">Tentang Salam Bumi Property</h1>
          <p className="text-white/70 text-lg italic">"Finding The Best Properties, Will Be Easier And More Precise"</p>
        </div>
      </section>

      {/* Mission */}
      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-xs font-semibold text-[#1565C0] uppercase tracking-wide">MISI KAMI</span>
              <h2 className="font-display text-3xl font-bold text-[#0F172A] mt-2 mb-4">Portal Properti Berbasis Kepercayaan</h2>
              <p className="text-[#64748B] leading-relaxed mb-4">
                Salam Bumi Property (SBP) adalah platform properti di DI Yogyakarta yang beroperasi dengan prinsip berbeda: <strong>tanpa sistem agen pihak ketiga</strong>. Setiap listing dikurasi dan diverifikasi langsung oleh tim SBP.
              </p>
              <p className="text-[#64748B] leading-relaxed mb-4">
                Kami percaya bahwa transaksi properti yang baik dimulai dari informasi yang jujur, legalitas yang jelas, dan kepercayaan yang terbangun. Bukan dari tekanan penjualan.
              </p>
              <p className="text-[#64748B] leading-relaxed">
                Dengan posisi sebagai <em>"portal investasi cerdas"</em>, SBP menghadirkan analisis mendalam untuk setiap properti — yield, payback period, dan Cap Rate — sehingga pembeli dapat membuat keputusan berbasis data.
              </p>
            </div>
            <div className="bg-[#F0F4F8] rounded-3xl p-8">
              <div className="text-6xl text-center mb-4">🏠</div>
              <blockquote className="text-center text-lg font-semibold text-[#0F172A] italic">
                "Don't Wait To Buy Real Estate,<br/>Buy Real Estate And Wait"
              </blockquote>
              <p className="text-center text-[#64748B] text-sm mt-3">— Filosofi Investasi SBP</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-10" style={{ background: '#0B2447' }}>
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 text-center">
            {[
              { value: '150+', label: 'Listing Aktif', icon: '🏠' },
              { value: '80+', label: 'Transaksi Selesai', icon: '✅' },
              { value: '100%', label: 'Listing Dikurasi', icon: '🔍' },
              { value: '5.0 ⭐', label: 'Rating Klien', icon: '⭐' },
            ].map(s => (
              <div key={s.label}>
                <div className="text-3xl mb-1">{s.icon}</div>
                <div className="text-3xl font-bold font-display text-[#29B6F6]">{s.value}</div>
                <div className="text-white/60 text-sm mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tim */}
      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl font-bold text-[#0F172A]">Tim Kami</h2>
            <p className="text-[#64748B] mt-2">Profesional berpengalaman di dunia properti Yogyakarta</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-2xl mx-auto">
            {[
              {
                nama: 'Monica Vera S',
                jabatan: 'Admin & Agent Properti',
                foto: 'https://images.salambumi.xyz/monic%20sbp.webp',
                desc: 'Berpengalaman dalam pemasaran properti dan pelayanan klien. Monica adalah wajah pertama yang akan Anda temui saat berinteraksi dengan SBP.',
                wa: '6281391278889',
              },
              {
                nama: 'Ardy Salam',
                jabatan: 'Founder & Principal Agent',
                foto: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80',
                desc: 'Pendiri CV Salam Bumi Property dengan rekam jejak lebih dari 5 tahun di industri properti Yogyakarta. Spesialisasi investasi properti dan legalitas.',
                wa: '6281391278889',
              },
            ].map(t => (
              <div key={t.nama} className="text-center bg-[#F0F4F8] rounded-3xl p-8">
                <img src={t.foto} alt={t.nama} className="w-28 h-28 rounded-full object-cover mx-auto mb-4 border-4 border-[#1565C0]"
                  onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80'; }} />
                <h3 className="font-display font-bold text-[#0F172A] text-lg">{t.nama}</h3>
                <p className="text-[#1565C0] text-sm font-medium mb-3">{t.jabatan}</p>
                <p className="text-[#64748B] text-sm leading-relaxed mb-4">{t.desc}</p>
                <a href={`https://wa.me/${t.wa}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white bg-[#10B981] hover:bg-[#059669] transition-colors">
                  💬 WhatsApp
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Keunggulan */}
      <section className="py-16" style={{ background: '#F0F4F8' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl font-bold text-[#0F172A]">Mengapa Memilih SBP?</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: CheckCircle, title: 'Terverifikasi', desc: 'Setiap listing dicek legalitas, lokasi, dan keaslian foto secara langsung' },
              { icon: Shield, title: 'Transparan', desc: 'Tanpa biaya tersembunyi bagi pembeli. Semua fee terdokumentasi jelas' },
              { icon: Scale, title: 'Legalitas Dicek', desc: 'Notaris rekanan membantu proses AJB, balik nama, dan pengecekan sertifikat' },
              { icon: Handshake, title: 'Pendampingan', desc: 'Tim SBP mendampingi dari pencarian hingga transaksi selesai' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl p-6 shadow-sm text-center">
                <div className="w-12 h-12 rounded-xl bg-[#E3F2FD] flex items-center justify-center mx-auto mb-4">
                  <Icon size={22} className="text-[#1565C0]" />
                </div>
                <h3 className="font-display font-bold text-[#0F172A] mb-2">{title}</h3>
                <p className="text-[#64748B] text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Legitimasi */}
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="font-display text-2xl font-bold text-[#0F172A] mb-6">Legalitas Usaha</h2>
          <div className="bg-[#F0F4F8] rounded-2xl p-8 inline-block text-left">
            <div className="space-y-2 text-sm text-[#64748B]">
              <div><strong className="text-[#0F172A]">Nama Perusahaan:</strong> CV Salam Bumi Property</div>
              <div><strong className="text-[#0F172A]">Alamat:</strong> Jl. Pajajaran, Catur Tunggal, Depok, Sleman, DI Yogyakarta (Virtual Office)</div>
              <div><strong className="text-[#0F172A]">WhatsApp:</strong> 0813-9127-8889</div>
              <div><strong className="text-[#0F172A]">Email:</strong> {emailDisplay}</div>
              <div><strong className="text-[#0F172A]">Website:</strong> salambumi.xyz</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16" style={{ background: 'linear-gradient(160deg, #0B2447 0%, #1565C0 100%)' }}>
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="font-display text-3xl font-bold text-white mb-4">Siap Bekerja Sama dengan SBP?</h2>
          <p className="text-white/70 mb-8">Titip jual properti Anda atau temukan properti impian bersama tim kami</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/titip-jual" className="px-8 py-3 rounded-xl font-semibold text-[#0B2447] bg-white hover:bg-[#E3F2FD] transition-colors">
              Titip Jual Properti
            </Link>
            <Link to="/properties" className="px-8 py-3 rounded-xl font-semibold text-white border border-white hover:bg-white/10 transition-colors flex items-center gap-2 justify-center">
              Lihat Properti <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
