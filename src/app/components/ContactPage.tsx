import { useState } from 'react';
import { Phone, Mail, MapPin, Clock, MessageCircle, Send } from 'lucide-react';

export default function ContactPage() {
  const [nama, setNama] = useState('');
  const [kontak, setKontak] = useState('');
  const [pesan, setPesan] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nama || !kontak || !pesan) return;
    const msg = encodeURIComponent(`Halo SBP!\nNama: ${nama}\nKontak: ${kontak}\nPesan: ${pesan}`);
    window.open(`https://wa.me/6281391278889?text=${msg}`, '_blank');
    setSent(true);
  };

  return (
    <div className="pt-16">
      <section className="py-16" style={{ background: 'linear-gradient(160deg, #0B2447 0%, #1565C0 100%)' }}>
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="font-display text-4xl font-bold text-white mb-3">Hubungi Kami</h1>
          <p className="text-white/70">Tim SBP siap membantu Anda menemukan properti terbaik</p>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Info */}
            <div>
              <h2 className="font-display text-2xl font-bold text-[#0F172A] mb-6">Informasi Kontak</h2>
              <div className="space-y-5">
                {[
                  { icon: Phone, label: 'WhatsApp', value: '0813-9127-8889', href: 'https://wa.me/6281391278889' },
                  { icon: Mail, label: 'Email', value: 'salambumiproperty@gmail.com', href: 'mailto:salambumiproperty@gmail.com' },
                  { icon: MapPin, label: 'Alamat', value: 'Jl. Pajajaran, Catur Tunggal, Depok, Sleman, DI Yogyakarta (Virtual Office)', href: '#' },
                  { icon: Clock, label: 'Jam Operasional', value: 'Senin – Sabtu: 08.00 – 20.00 WIB', href: '#' },
                ].map(({ icon: Icon, label, value, href }) => (
                  <div key={label} className="flex items-start gap-4 p-4 bg-[#F0F4F8] rounded-xl">
                    <div className="w-10 h-10 rounded-xl bg-[#E3F2FD] flex items-center justify-center flex-shrink-0">
                      <Icon size={18} className="text-[#1565C0]" />
                    </div>
                    <div>
                      <div className="text-xs text-[#64748B] font-semibold uppercase">{label}</div>
                      <a href={href} className="text-[#0F172A] text-sm hover:text-[#1565C0] transition-colors">{value}</a>
                    </div>
                  </div>
                ))}
              </div>

              {/* Map Placeholder */}
              <div className="mt-6 bg-[#E3F2FD] rounded-2xl h-48 flex flex-col items-center justify-center gap-2">
                <MapPin size={32} className="text-[#1565C0]" />
                <p className="text-[#1565C0] font-semibold text-sm">Depok, Sleman, DI Yogyakarta</p>
                <a href="https://maps.google.com?q=Catur+Tunggal+Depok+Sleman" target="_blank" rel="noopener noreferrer"
                  className="text-xs text-[#1565C0] underline">Buka di Google Maps ↗</a>
              </div>
            </div>

            {/* Form */}
            <div>
              <h2 className="font-display text-2xl font-bold text-[#0F172A] mb-6">Kirim Pesan</h2>
              {sent ? (
                <div className="text-center py-12 bg-green-50 rounded-2xl">
                  <div className="text-5xl mb-4">✅</div>
                  <h3 className="font-bold text-xl text-[#0F172A]">Pesan Terkirim!</h3>
                  <p className="text-[#64748B] mt-2">WhatsApp dibuka. Tim kami akan segera menghubungi Anda.</p>
                  <button onClick={() => setSent(false)} className="mt-6 px-6 py-2 rounded-xl text-sm text-[#1565C0] border border-[#1565C0] hover:bg-[#E3F2FD]">
                    Kirim Lagi
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#64748B] mb-1">Nama *</label>
                    <input value={nama} onChange={e => setNama(e.target.value)} required placeholder="Nama Anda"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#64748B] mb-1">WhatsApp / Email *</label>
                    <input value={kontak} onChange={e => setKontak(e.target.value)} required placeholder="Nomor WA atau email"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0]" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#64748B] mb-1">Pesan *</label>
                    <textarea value={pesan} onChange={e => setPesan(e.target.value)} required rows={4}
                      placeholder="Tulis pesan Anda..." className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0] resize-none" />
                  </div>
                  <div className="flex gap-3">
                    <button type="submit" className="flex-1 py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
                      <Send size={16} /> Kirim Pesan
                    </button>
                    <a href="https://wa.me/6281391278889" target="_blank" rel="noopener noreferrer"
                      className="flex-1 py-3 rounded-xl font-semibold text-white bg-[#10B981] hover:bg-[#059669] transition-colors flex items-center justify-center gap-2 text-center">
                      <MessageCircle size={16} /> WhatsApp
                    </a>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
