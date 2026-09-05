// STASIUN 5-6 — STORYBOARD + RETENTION CHECK + ADU HOOK.
//
// Layar tempat manusia MENILAI sebelum membakar kuota render. Google Flow gratis
// hanya memberi 3 generate, dan satu video memakai ketiganya — jadi storyboard
// yang buruk bukan cuma video jelek, tapi seharian tanpa produksi.
//
// Retention check dihitung ULANG di sini (bukan sekadar menampilkan yang
// tersimpan) supaya hasilnya langsung berubah begitu hook diganti lewat Adu Hook.
// Fungsinya sama persis dengan yang dipakai server — satu modul, dua pemanggil.
import { useState, useMemo } from 'react';
import {
  Loader2, CheckCircle2, AlertTriangle, Swords, Check, Film, Clock,
} from 'lucide-react';
import { bacaJson } from '../../../../lib/api';
import { periksaRetensi, PATOKAN } from '../../../../../functions/_lib/retensi.js';

// Skema K2 (rencana v2) — `beats` menggantikan `cuts` lama: setiap beat WAJIB
// membawa Narrative State (viewer_question → reveal → informasi_baru →
// next_question), bukan sekadar foto + kamera + aksi.
interface Beat {
  mulai: number; selesai: number; foto_id: number;
  viewer_question: string; start_state: string; kamera: string; aksi: string;
  reveal: string; informasi_baru: string; end_state: string; next_question: string;
}
export interface PartIR {
  peran: string;
  /** null hanya untuk Part 1 — Part berikutnya wajib menyambung dari sini. */
  continuity_in: string | null;
  /** Boleh kosong HANYA di Part terakhir. */
  continuity_out: string;
  beats: Beat[];
  dialog: string;
  teks_layar: string;
}

// Skema K1 — keluaran Stasiun Konsep (`hasil_json.konsep`). AI mengusulkan 3
// kandidat sudut cerita, kode menyaring salah satunya jadi Creative DNA yang
// benar-benar dieksekusi storyboard.
interface Audiens { utama: string; keinginan: string; keberatan: string; pemicu: string }
interface KandidatSudut {
  id: string; sudut: string; alasan: string;
  fakta_pendukung?: string[]; foto_pendukung?: number[];
}
interface CreativeDna {
  sudut: string; hook_mekanisme: string; pemicu_psikologis: string;
  struktur_naratif: string; foto_pembuka: number;
  urutan_informasi?: string[]; profil_pacing?: string; bahasa_kamera?: string;
  payoff?: string; gaya_cta?: string;
}
interface CeritaGlobal {
  janji?: string; part1_open_loop?: string; part2_payoff?: string;
  part2_open_loop?: string; part3_payoff?: string;
}
interface PetaRetensi { '0_3'?: string; '3_10'?: string; '10_20'?: string; '20_30'?: string }
interface Konsep {
  audiens?: Audiens;
  kandidat?: KandidatSudut[];
  dna?: CreativeDna;
  cerita_global?: CeritaGlobal;
  peta_retensi?: PetaRetensi;
}

export interface HasilPesanan {
  konsep?: Konsep;
  parts?: PartIR[];
  params?: { jumlahPart: number; detikPerPart: number; voDetikPerPart: number; cta: string; faceless?: boolean };
  variasi?: Record<string, string>;
  /** DNA Produk — dipakai memeriksa klaim jarak yang dikarang. */
  dna?: { fakta?: { label: string; nilai: string }[]; keunikan?: string[] };
  provider?: string;
  caption?: { teks: string; hashtags: string };
}
interface Kandidat { dialog: string; teks_layar: string }
interface HasilAdu {
  kandidat: Kandidat[]; pemenang: number | null; alasan: string;
  dua_arah: boolean; penulis: string; juri: string; pesan: string;
}

const PETA_RETENSI_URUTAN: { key: keyof PetaRetensi; label: string }[] = [
  { key: '0_3', label: '0–3 dtk' },
  { key: '3_10', label: '3–10 dtk' },
  { key: '10_20', label: '10–20 dtk' },
  { key: '20_30', label: '20–30 dtk' },
];

export default function PanelStoryboard({ orderId, hasil, onUbah }: {
  orderId: number;
  hasil: HasilPesanan;
  /** Dipanggil setelah hook diganti — induk memuat ulang pesanan. */
  onUbah: () => void;
}) {
  const [adu, setAdu] = useState<HasilAdu | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState('');
  const [pesan, setPesan] = useState('');

  const parts = hasil.parts ?? [];
  const dnaTerpilih = hasil.konsep?.dna;
  const kandidatSudut = hasil.konsep?.kandidat ?? [];
  const petaRetensi = hasil.konsep?.peta_retensi;

  // Dihitung ulang tiap render dari IR yang sedang tampil — bukan dibaca dari
  // hasil tersimpan. Itu yang membuat daftar cacat langsung menyesuaikan setelah
  // hook diganti, tanpa perlu memanggil server lagi.
  const cek = useMemo(() => {
    if (!hasil.params || parts.length === 0) return null;
    try {
      return periksaRetensi({
        ir: { parts, variasi: hasil.variasi ?? {} },
        params: hasil.params,
        // DNA ikut dikirim supaya pemeriksaan klaim jarak juga hidup di browser
        // — tanpa itu, cacat `jarak_dikarang` hilang tepat setelah hook diganti.
        dna: hasil.dna ?? null,
      });
    } catch {
      return null;
    }
  }, [parts, hasil.params, hasil.variasi]);

  const jalankanAdu = async () => {
    if (sibuk) return;
    setSibuk(true); setError(''); setAdu(null); setPesan('');
    try {
      const res = await fetch(`/api/admin/viralframe/orders/${orderId}/hook-battle`, {
        method: 'POST', credentials: 'include',
      });
      const json = await bacaJson<HasilAdu>(res);
      if (!json.success || !json.data) { setError(json.error ?? 'Adu hook gagal.'); return; }
      setAdu(json.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Adu hook gagal.');
    } finally {
      setSibuk(false);
    }
  };

  const pakaiHook = async (k: Kandidat) => {
    if (sibuk || parts.length === 0) return;
    setSibuk(true); setError('');
    try {
      const partsBaru = parts.map((p, i) =>
        i === 0 ? { ...p, dialog: k.dialog, teks_layar: k.teks_layar || p.teks_layar } : p);
      const res = await fetch(`/api/admin/viralframe/orders/${orderId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        // Seluruh hasil dikirim ulang, bukan hanya bagian yang berubah: PATCH
        // menerima `hasil` sebagai satu objek, dan mengirim potongan akan
        // menghapus prompt Flow serta caption yang sudah ada.
        body: JSON.stringify({ hasil: { ...hasil, parts: partsBaru } }),
      });
      const json = await bacaJson(res);
      if (!json.success) { setError(json.error ?? 'Gagal menyimpan hook.'); return; }
      setAdu(null);
      // Prompt Flow & retention check diturunkan ulang oleh server dari `parts`
      // yang baru — tidak ada langkah manual yang harus diingat user.
      setPesan('Hook diganti. Prompt Google Flow dan retention check ikut diperbarui.');
      onUbah();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan hook.');
    } finally {
      setSibuk(false);
    }
  };

  if (parts.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-display font-bold text-[#0F172A] text-sm flex items-center gap-1.5">
          <Film size={15} className="text-[#1565C0]" /> Storyboard
        </h2>
        {hasil.provider && <span className="text-[11px] text-[#94A3B8]">disusun {hasil.provider}</span>}
      </div>

      <div className="p-4 space-y-4">
        {(dnaTerpilih || kandidatSudut.length > 0) && (
          <div className="bg-[#F8FAFC] border border-gray-100 rounded-xl p-3.5 space-y-3">
            {dnaTerpilih && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-[#94A3B8] font-semibold mb-1">Konsep terpilih</div>
                <p className="text-sm text-[#0F172A] font-medium">{dnaTerpilih.sudut}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-[#64748B]">
                  {dnaTerpilih.hook_mekanisme && <span>Hook: <b className="text-[#334155]">{dnaTerpilih.hook_mekanisme}</b></span>}
                  {dnaTerpilih.struktur_naratif && <span>Naratif: <b className="text-[#334155]">{dnaTerpilih.struktur_naratif}</b></span>}
                  {dnaTerpilih.payoff && <span>Payoff: {dnaTerpilih.payoff}</span>}
                  {dnaTerpilih.gaya_cta && <span>CTA: {dnaTerpilih.gaya_cta}</span>}
                </div>
              </div>
            )}

            {/* 3 kandidat sudut yang diusulkan AI, disaring sistem — ditampilkan
                supaya pemilihannya bisa dikoreksi manusia, bukan kotak hitam. */}
            {kandidatSudut.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-[#94A3B8] font-semibold mb-1.5">3 kandidat sudut</div>
                <div className="space-y-1.5">
                  {kandidatSudut.map(k => {
                    const menang = dnaTerpilih != null && k.sudut === dnaTerpilih.sudut;
                    return (
                      <div key={k.id} className={`rounded-lg border p-2.5 ${menang ? 'border-[#1565C0] bg-[#EFF6FF]' : 'border-gray-200 bg-white'}`}>
                        <div className="flex items-center gap-1.5">
                          {menang && <Check size={12} className="text-[#1565C0] shrink-0" />}
                          <span className="text-xs font-semibold text-[#0F172A]">{k.sudut}</span>
                          {menang && <span className="text-[10px] font-semibold text-[#1565C0]">Terpilih</span>}
                        </div>
                        {k.alasan && <p className="text-[11px] text-[#64748B] mt-0.5 leading-relaxed">{k.alasan}</p>}
                        {k.fakta_pendukung && k.fakta_pendukung.length > 0 && (
                          <p className="text-[10px] text-[#94A3B8] mt-1">Fakta: {k.fakta_pendukung.join(' · ')}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Peta retensi (K1: `konsep.peta_retensi`) — rencana apa yang
                menahan penonton di tiap jendela waktu, bukan hasil ukur video jadi. */}
            {petaRetensi && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-[#94A3B8] font-semibold mb-1.5">Peta retensi</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {PETA_RETENSI_URUTAN.filter(({ key }) => petaRetensi[key]).map(({ key, label }) => (
                    <div key={key} className="rounded-lg bg-white border border-gray-200 p-2">
                      <div className="text-[10px] font-semibold text-[#1565C0]">{label}</div>
                      <div className="text-[11px] text-[#334155] mt-0.5 leading-snug">{petaRetensi[key]}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── RETENTION CHECK ──────────────────────────────────────────── */}
        {cek && (
          <div className={`rounded-xl border p-3.5 ${cek.lolos ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
            <div className="flex items-center gap-1.5 mb-1.5">
              {cek.lolos
                ? <CheckCircle2 size={15} className="text-emerald-600" />
                : <AlertTriangle size={15} className="text-amber-600" />}
              <span className={`text-sm font-semibold ${cek.lolos ? 'text-emerald-800' : 'text-amber-900'}`}>
                Retention check — {cek.ringkas}
              </span>
            </div>
            {cek.cacat.length > 0 && (
              <ul className="space-y-1 mt-2">
                {cek.cacat.map((c, i) => (
                  <li key={i} className="text-xs leading-relaxed flex gap-1.5">
                    <span className={`shrink-0 mt-1 w-1.5 h-1.5 rounded-full ${c.berat === 'tinggi' ? 'bg-red-500' : 'bg-amber-400'}`} />
                    <span className={c.berat === 'tinggi' ? 'text-amber-900' : 'text-amber-800'}>{c.pesan}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[10px] text-[#94A3B8] mt-2 leading-relaxed">
              Patokan: video 15–30 detik dianggap sehat di atas {PATOKAN.tiktok_15_30.target}% retensi,
              kuat di atas {PATOKAN.tiktok_15_30.kuat}%. {PATOKAN.diagnosis} Ini pemeriksaan naskah,
              bukan prediksi retensi video jadi.
            </p>
          </div>
        )}

        {/* ── ADU HOOK ─────────────────────────────────────────────────── */}
        <div>
          <button
            onClick={jalankanAdu}
            disabled={sibuk}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: '#7C3AED' }}>
            {sibuk ? <Loader2 size={13} className="animate-spin" /> : <Swords size={13} />}
            {sibuk ? 'Menilai…' : 'Adu 3 hook alternatif'}
          </button>
          <span className="ml-2 text-[11px] text-[#94A3B8]">
            Juri membandingkan berpasangan dua arah — skor absolut tidak terkalibrasi.
          </span>

          {pesan && <div className="mt-2 text-xs text-[#1E40AF] bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg px-3 py-2">{pesan}</div>}
          {error && <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

          {adu && (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] text-[#64748B]">
                {adu.pesan} <span className="text-[#94A3B8]">(ditulis {adu.penulis}, dinilai {adu.juri})</span>
              </p>
              {adu.kandidat.map((k, i) => {
                const menang = adu.pemenang === i;
                return (
                  <div key={i} className={`rounded-xl border p-3 ${menang ? 'border-[#7C3AED] bg-[#F5F3FF]' : 'border-gray-200'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-[#0F172A] leading-snug">“{k.dialog}”</p>
                        {k.teks_layar && <p className="text-[11px] text-[#64748B] mt-1">Teks layar: {k.teks_layar}</p>}
                        <p className="text-[10px] text-[#94A3B8] mt-1 tabular-nums">
                          {k.dialog.trim().split(/\s+/).length} kata
                        </p>
                      </div>
                      <button
                        onClick={() => pakaiHook(k)}
                        disabled={sibuk}
                        className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                        style={{ background: menang ? '#7C3AED' : '#64748B' }}>
                        Pakai
                      </button>
                    </div>
                    {menang && adu.alasan && (
                      <p className="text-[11px] text-[#7C3AED] mt-1.5 italic">Pemenang juri: {adu.alasan}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── PART ─────────────────────────────────────────────────────── */}
        <div className="space-y-2.5">
          {parts.map((p, i) => (
            <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-bold text-[#0F172A]">
                  Part {i + 1} <span className="font-normal text-[#94A3B8]">· {p.peran}</span>
                </span>
                <span className="text-[11px] text-[#94A3B8] tabular-nums flex items-center gap-1">
                  <Clock size={11} /> {p.beats.reduce((s, b) => s + (b.selesai - b.mulai), 0).toFixed(1)}s · {p.beats.length} beat
                </span>
              </div>
              <div className="p-3 space-y-2">
                {(p.continuity_in || p.continuity_out) && (
                  <div className="text-[10px] text-[#94A3B8] flex flex-wrap gap-x-3">
                    {p.continuity_in && <span>Masuk: {p.continuity_in}</span>}
                    {p.continuity_out && <span>Keluar: {p.continuity_out}</span>}
                  </div>
                )}
                <p className="text-sm text-[#0F172A] leading-snug">“{p.dialog}”</p>
                {p.teks_layar && (
                  <p className="text-[11px] text-[#64748B]">
                    Teks layar: <b className="text-[#334155]">{p.teks_layar}</b>
                  </p>
                )}
                <ul className="space-y-1.5 pt-1 border-t border-gray-100">
                  {p.beats.map((b, j) => (
                    <li key={j} className="text-[11px] text-[#64748B] leading-snug">
                      <div className="flex gap-2">
                        <span className="tabular-nums text-[#94A3B8] shrink-0">{b.mulai}–{b.selesai}s</span>
                        <span>
                          <b className="text-[#334155]">#{b.foto_id}</b>
                          {b.kamera ? ` — ${b.kamera}.` : ''} {b.aksi}
                        </span>
                      </div>
                      {(b.reveal || b.informasi_baru) && (
                        <div className="pl-9 text-[#94A3B8]">
                          {b.reveal && <>Reveal: {b.reveal}. </>}
                          {b.informasi_baru && <>Info baru: {b.informasi_baru}</>}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* Caption SENGAJA tidak ditampilkan di sini. Satu-satunya tempatnya
            adalah kolom di panel Unggah, tempat ia benar-benar dipakai —
            menampilkannya di dua tempat berarti salinan di sini basi begitu
            user menyunting yang di bawah. */}
      </div>
    </div>
  );
}
