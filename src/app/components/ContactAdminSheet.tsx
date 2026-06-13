import { useState } from 'react';
import { MessageCircle, X, Star } from 'lucide-react';
import { postLead, formatRupiah, type NormalizedPropertyDetail } from '../../lib/api';
import { trackEvent } from '../../lib/tracking';

const RENCANA_MAP: Record<string, 'hard_cash' | 'soft_cash' | 'kpr'> = {
  'Hard Cash': 'hard_cash',
  'Soft Cash': 'soft_cash',
  'KPR': 'kpr',
};

const ADMIN_WA_GENERAL = `https://wa.me/6281391278889?text=${encodeURIComponent('Halo, saya ingin konsultasi kebutuhan properti')}`;

interface Props {
  property?: NormalizedPropertyDetail | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function ContactAdminSheet({ property, isOpen, onClose }: Props) {
  const [tipe, setTipe] = useState('');
  const [nama, setNama] = useState('');
  const [no_wa, setNoWa] = useState('');
  const [asal, setAsal] = useState('');
  const [budget, setBudget] = useState('');
  const [rencana, setRencana] = useState('');
  const [pesan, setPesan] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [skipLoading, setSkipLoading] = useState(false);

  const isValid = Boolean(tipe && nama && no_wa.trim() && asal && (tipe !== 'pembeli' || (budget && rencana)));

  const handleSubmit = async () => {
    if (!isValid || sending) return;
    setSending(true);
    setApiError(null);
    const res = await postLead({
      nama,
      no_wa: no_wa.trim(),
      tipe_pengirim: tipe as 'pembeli' | 'penjual' | 'broker',
      source_page: window.location.href,
      property_id: property?.id,
      asal_daerah: asal || undefined,
      budget: budget || undefined,
      rencana_pembayaran: RENCANA_MAP[rencana] ?? undefined,
      pesan: pesan || undefined,
    });
    setSending(false);
    if (res.success && res.data) {
      setSubmitted(true);
      trackEvent('Lead', {
        content_name: property?.title ?? 'Konsultasi',
        content_ids: property ? [property.kode] : [],
        content_category: tipe,
        value: property?.harga,
        currency: 'IDR',
      }, { eventID: res.data.event_id });
      window.location.href = res.data.wa_url;
    } else {
      setApiError(res.error ?? 'Gagal menyimpan pesan. Coba lagi.');
    }
  };

  // Jalur cadangan: simpan lead quick_wa lalu buka WA tanpa isi form
  const handleSkip = async () => {
    if (skipLoading) return;
    setSkipLoading(true);
    if (!property) {
      // Tanpa konteks properti — redirect WA umum langsung, tanpa API call
      trackEvent('Contact', { content_ids: [] });
      window.location.href = ADMIN_WA_GENERAL;
      return;
    }
    const fallback = `https://wa.me/6281391278889?text=${encodeURIComponent(`Halo, saya tertarik dengan properti: ${property.title}`)}`;
    let waUrl = fallback;
    let contactEventId: string | undefined;
    try {
      const r = await fetch(`/api/properties/${property.slug}/wa-click`, { method: 'POST' });
      const d = await r.json();
      waUrl = d?.data?.wa_url ?? fallback;
      contactEventId = d?.data?.event_id;
    } catch { /* pakai fallback */ }
    trackEvent('Contact', {
      content_name: property.title,
      content_ids: [property.kode],
      value: property.harga,
      currency: 'IDR',
    }, { eventID: contactEventId });
    window.location.href = waUrl;
  };

  const inputClass = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0] transition-all';

  return (
    <div className={`fixed inset-0 z-50 transition-all duration-300 ${isOpen ? 'visible' : 'invisible pointer-events-none'}`}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Sheet panel */}
      <div className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl transition-transform duration-300 ${isOpen ? 'translate-y-0' : 'translate-y-full'} max-h-[80vh] flex flex-col`}>

        {/* Header */}
        <div className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-gray-100">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {property ? (
                <>
                  {property.images[0] && (
                    <img
                      src={property.images[0]}
                      alt={property.title}
                      className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-[#0F172A] text-sm line-clamp-1">{property.title}</div>
                    <div className="text-xs text-[#1565C0] font-bold">{formatRupiah(property.harga)}</div>
                  </div>
                </>
              ) : (
                <div className="min-w-0">
                  <div className="font-semibold text-[#0F172A] text-sm">Konsultasi Kebutuhan Properti Anda</div>
                  <div className="text-xs text-[#64748B]">Gratis · Tim SBP siap membantu</div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              <button
                onClick={handleSkip}
                disabled={skipLoading}
                className="text-xs text-[#1565C0] font-medium hover:underline disabled:opacity-50 whitespace-nowrap"
              >
                {skipLoading ? '...' : 'Langsung WA'}
              </button>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Agent */}
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
            <img
              src="https://images.salambumi.xyz/monic%20sbp.webp"
              alt="Monica Vera S"
              className="w-12 h-12 rounded-full object-cover border-2 border-[#1565C0]"
              onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80'; }}
            />
            <div>
              <div className="font-semibold text-[#0F172A] text-sm">Monica Vera S</div>
              <div className="text-xs text-[#64748B]">Admin/Agent Properti</div>
              <div className="flex gap-0.5 mt-0.5">
                {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={10} fill="#F5A623" className="text-[#F5A623]" />)}
              </div>
            </div>
          </div>

          <h4 className="font-semibold text-[#0F172A] mb-4 text-sm">Kirim Pesan ke Admin</h4>

          <div className="mb-4">
            <label className="block text-xs font-semibold text-[#64748B] mb-1">Beritahu Kami Siapakah Anda?</label>
            <select value={tipe} onChange={e => setTipe(e.target.value)} className={inputClass}>
              <option value="">-- Pilih --</option>
              <option value="pembeli">Calon Pembeli</option>
              <option value="penjual">Penjual/Pemilik</option>
              <option value="broker">Broker/Agent</option>
            </select>
          </div>

          {tipe && (
            <>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1">Nama *</label>
                  <input value={nama} onChange={e => setNama(e.target.value)} placeholder="Nama lengkap" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1">Asal Daerah *</label>
                  <input value={asal} onChange={e => setAsal(e.target.value)} placeholder="Jakarta, dll" className={inputClass} />
                </div>
              </div>

              <div className="mb-3">
                <label className="block text-xs font-semibold text-[#64748B] mb-1">No. WhatsApp *</label>
                <input
                  value={no_wa}
                  onChange={e => setNoWa(e.target.value)}
                  placeholder="08xx / 628xx"
                  type="tel"
                  inputMode="numeric"
                  className={inputClass}
                />
                <p className="text-[10px] text-[#64748B] mt-0.5">Format: 08xx, 628xx, atau +628xx</p>
              </div>

              {tipe === 'pembeli' && (
                <>
                  <div className="mb-3">
                    <label className="block text-xs font-semibold text-[#64748B] mb-1">Estimasi Budget *</label>
                    <select value={budget} onChange={e => setBudget(e.target.value)} className={inputClass}>
                      <option value="">-- Pilih Budget --</option>
                      {['< 500 Jt', '500 Jt – 1 M', '1 M – 2 M', '2 M – 3 M', '3 M – 5 M', '> 5 M'].map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="block text-xs font-semibold text-[#64748B] mb-1">Rencana Pembayaran *</label>
                    <div className="flex gap-2">
                      {['Hard Cash', 'Soft Cash', 'KPR'].map(r => (
                        <button key={r} onClick={() => setRencana(r)}
                          className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-all ${rencana === r ? 'bg-[#1565C0] text-white border-[#1565C0]' : 'border-gray-200 text-gray-600 hover:border-[#1565C0]'}`}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="mb-4">
                <label className="block text-xs font-semibold text-[#64748B] mb-1">Pesan Tambahan</label>
                <textarea value={pesan} onChange={e => setPesan(e.target.value)} rows={3}
                  placeholder="Tulis pesan Anda..."
                  className={`${inputClass} resize-none`} />
              </div>
            </>
          )}

          {!isValid && tipe && (
            <p className="text-xs text-[#64748B] text-center mb-3">Lengkapi semua field wajib (*) untuk menghubungi via WhatsApp</p>
          )}

          {apiError && (
            <p className="text-xs text-[#EF4444] text-center mb-3 bg-red-50 rounded-xl px-3 py-2">⚠️ {apiError}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={!isValid || sending}
            className={`w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all duration-200 ${
              isValid && !sending ? 'bg-[#10B981] hover:bg-[#059669] shadow-md' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            <MessageCircle size={18} />
            {sending ? 'Menyimpan data...' : isValid ? 'Hubungi via WhatsApp' : 'Lengkapi Form Terlebih Dahulu'}
          </button>

          {submitted && <p className="text-xs text-[#10B981] text-center mt-2">✅ Lead tersimpan! WhatsApp dibuka...</p>}
          <div className="pb-4" />
        </div>
      </div>
    </div>
  );
}
