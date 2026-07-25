import { useState } from 'react';
import { ChevronDown, MessageCircle } from 'lucide-react';
import { FAQ_DATA } from '../data/mockData';
import { pageMeta } from '../../lib/pageMeta';
import { trackWaClick } from '../../lib/waTrack';

export const meta = () => [
  ...pageMeta({
    title: 'FAQ Jual Beli Properti Yogyakarta | Salam Bumi Property',
    description: 'Jawaban pertanyaan umum seputar jual-beli properti di Yogyakarta: proses transaksi, legalitas, KPR, titip jual, dan layanan Salam Bumi Property.',
    path: '/faq',
  }),
  // FAQPage structured data — semua Q&A dari FAQ_DATA (rich result + sinyal GEO)
  {
    'script:ld+json': {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ_DATA.flatMap(k => k.pertanyaan).map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    },
  },
];

function AccordionItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-[#0F172A] text-sm pr-4">{q}</span>
        <ChevronDown size={18} className={`text-[#1565C0] flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 text-sm text-[#64748B] leading-relaxed border-t border-gray-100">
          <div className="pt-3">{a}</div>
        </div>
      )}
    </div>
  );
}

export default function FAQPage() {
  const [activeKat, setActiveKat] = useState('Semua');
  const kategori = ['Semua', ...FAQ_DATA.map(k => k.kategori)];

  const filtered = activeKat === 'Semua' ? FAQ_DATA : FAQ_DATA.filter(k => k.kategori === activeKat);

  return (
    <div className="pt-16">
      {/* Hero */}
      <section className="py-16" style={{ background: 'linear-gradient(160deg, #0B2447 0%, #1565C0 100%)' }}>
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="font-display text-4xl font-bold text-white mb-3">Pertanyaan Umum (FAQ)</h1>
          <p className="text-white/70">Jawaban untuk pertanyaan yang sering ditanyakan seputar properti dan SBP</p>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Kategori tabs */}
          <div className="flex gap-2 flex-wrap mb-10 justify-center">
            {kategori.map(k => (
              <button
                key={k}
                onClick={() => setActiveKat(k)}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                  activeKat === k ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'border-gray-200 text-gray-600 hover:border-[#1565C0]'
                }`}
              >
                {k}
              </button>
            ))}
          </div>

          {filtered.map(kat => (
            <div key={kat.kategori} className="mb-10">
              <h2 className="font-display font-bold text-[#0F172A] text-xl mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-[#E3F2FD] text-[#1565C0] flex items-center justify-center text-sm font-bold">?</span>
                {kat.kategori}
              </h2>
              <div className="space-y-3">
                {kat.pertanyaan.map((p, i) => (
                  <AccordionItem key={i} q={p.q} a={p.a} />
                ))}
              </div>
            </div>
          ))}

          {/* CTA */}
          <div className="mt-12 bg-[#F0F4F8] rounded-2xl p-8 text-center">
            <h3 className="font-display font-bold text-[#0F172A] text-xl mb-2">Masih Ada Pertanyaan?</h3>
            <p className="text-[#64748B] mb-6">Tim SBP siap membantu Anda setiap saat</p>
            <a
              href="https://wa.me/6281391278889?text=Halo SBP, saya ingin bertanya..."
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackWaClick('faq')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white bg-[#10B981] hover:bg-[#059669] transition-colors"
            >
              <MessageCircle size={18} /> Hubungi via WhatsApp
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
