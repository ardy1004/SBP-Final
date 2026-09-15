// Upload manual langsung dari tab Konten Agent — TANPA pesanan/storyboard.
// Menutup jalur kedua ke `viralframe_agent_videos`, di samping "Upload Hasil"
// (PanelUnggah.tsx) yang terikat pesanan. Sengaja TIDAK berbagi kode dengan
// PanelUnggah.tsx: jalur pesanan sudah battle-tested di produksi, dan
// menyentuhnya demi ekstraksi bukan trade-off yang sepadan untuk ~50 baris
// (pola yang sama dipakai `thumbSrc` di AgentGrid.tsx — duplikat dulu,
// pindahkan ke modul bersama baru kalau pemakai ketiga muncul).
//
// Properti WAJIB dipilih (bukan opsional) — `viralframe_agent_videos.property_id`
// NOT NULL, dan hampir semua tampilan (judul, kode listing, badge SOLD/Premium)
// bergantung padanya. Daftar pilihannya TIDAK disaring lagi (keputusan user,
// 2026-09-16): admin boleh memilih listing jenis apa pun untuk agent mana pun.
// `agentCocok()` (sama seperti AgentGrid) sekarang cuma dipakai untuk
// menampilkan chip "di luar spesialis" pada listing yang berada di luar
// `spesialis` agent — sekadar info, karena videonya akan dijadwalkan ke akun
// sosial media agent itu sendiri, bukan pemblokir. Gate server `cekSpesialis()`
// di r2-sign.js / agent-videos POST juga sudah DICABUT — lihat
// `functions/_lib/agentAccounts.js`.
import { useState, useCallback } from 'react';
import { Upload, Loader2, Check, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { bacaJson } from '../../../../lib/api';
import { buatPosterDariVideo } from '../../../lib/posterVideo';
import { agentCocok } from './AgentGrid';

interface PropertiRingkas {
  id: number;
  kode_listing: string;
  title: string;
  jenis_properti: string;
}

interface Presign {
  key: string; posterKey: string;
  uploadUrl: string; posterUploadUrl: string;
  publicUrl: string; posterPublicUrl: string;
}

function ChipLuarSpesialis() {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-100">
      di luar spesialis
    </span>
  );
}

export default function PanelUnggahAgent({ characterId, spesialis, onSelesai }: {
  characterId: number;
  spesialis: string[];
  onSelesai: () => void;
}) {
  const [terbuka, setTerbuka] = useState(false);
  const [properti, setProperti] = useState<PropertiRingkas[] | null>(null);
  const [loadingProperti, setLoadingProperti] = useState(false);
  const [cari, setCari] = useState('');
  const [dipilih, setDipilih] = useState<PropertiRingkas | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [tahap, setTahap] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState('');
  const [sukses, setSukses] = useState('');

  const bebas = spesialis.length === 0;

  const bukaPanel = useCallback(async () => {
    setTerbuka(prev => !prev);
    if (properti != null || loadingProperti) return;
    setLoadingProperti(true);
    try {
      const res = await fetch('/api/admin/properties', { credentials: 'include' });
      const json = await bacaJson<{ properties: PropertiRingkas[] }>(res);
      if (json.success) setProperti(json.data?.properties ?? []);
    } catch { /* noop — list tetap kosong, kotak cari akan menampilkan pesan gagal */
    } finally { setLoadingProperti(false); }
  }, [properti, loadingProperti]);

  const kandidat = properti ?? [];
  const q = cari.trim().toLowerCase();
  const hasilCari = q
    ? kandidat.filter(p => p.title.toLowerCase().includes(q) || p.kode_listing.toLowerCase().includes(q))
    : kandidat;

  const unggah = async () => {
    if (!file || !dipilih || sibuk) return;
    setSibuk(true); setError(''); setTahap('Membaca video…');
    try {
      const poster = await buatPosterDariVideo(file);

      setTahap('Menyiapkan tempat unggah…');
      const pres = await fetch('/api/admin/viralframe/r2-sign', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: dipilih.id, character_id: characterId }),
      });
      const presJson = await bacaJson<Presign>(pres);
      if (!presJson.success || !presJson.data) throw new Error(presJson.error ?? 'Gagal menyiapkan unggahan.');
      const p = presJson.data;

      setTahap('Mengunggah video…');
      const putVideo = await fetch(p.uploadUrl, {
        method: 'PUT', body: file,
        headers: { 'Content-Type': file.type || 'video/mp4' },
      });
      if (!putVideo.ok) throw new Error(`Unggah video gagal (HTTP ${putVideo.status}).`);

      setTahap('Mengunggah sampul…');
      const putPoster = await fetch(p.posterUploadUrl, {
        method: 'PUT', body: poster.posterBlob,
        headers: { 'Content-Type': 'image/jpeg' },
      });
      // Sampul gagal TIDAK membatalkan videonya — sama seperti PanelUnggah.tsx.
      const posterUrl = putPoster.ok ? p.posterPublicUrl : null;

      setTahap('Mencatat video…');
      const simpan = await fetch('/api/admin/viralframe/agent-videos', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character_id: characterId,
          property_id: dipilih.id,
          storage: 'r2',
          r2_key: p.key,
          cloudinary_url: p.publicUrl,
          poster_url: posterUrl,
          caption: caption.trim() || null,
          hashtags: hashtags.trim() || null,
          duration_sec: poster.durationSec,
          width: poster.width,
          height: poster.height,
          bytes: file.size,
          format: (file.name.split('.').pop() ?? 'mp4').toLowerCase(),
        }),
      });
      const simpanJson = await bacaJson<{ id?: number }>(simpan);
      if (!simpanJson.success) throw new Error(simpanJson.error ?? 'Gagal mencatat video.');

      setTahap('');
      onSelesai();
      // Reset supaya bisa langsung lanjut upload video berikutnya untuk agent
      // yang sama, tanpa menutup panel — beda dari PanelUnggah.tsx yang cuma
      // menutup SATU pesanan lalu berhenti.
      setFile(null); setCaption(''); setHashtags(''); setDipilih(null); setCari('');
      setSukses('Video tersimpan — sudah muncul di grid.');
      setTimeout(() => setSukses(''), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal mengunggah.');
      setTahap('');
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button type="button" onClick={bukaPanel}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-gray-50">
        <div>
          <h2 className="font-display font-bold text-[#0F172A] text-sm">Upload video manual</h2>
          <p className="text-xs text-[#64748B] mt-0.5">
            {bebas ? 'Agent ini bebas — bisa untuk properti jenis apa pun.' : `Semua jenis bisa dipilih · spesialis: ${spesialis.join('/')}`}
          </p>
        </div>
        {terbuka ? <ChevronDown size={16} className="text-[#94A3B8] flex-shrink-0" /> : <ChevronRight size={16} className="text-[#94A3B8] flex-shrink-0" />}
      </button>

      {terbuka && (
        <div className="p-4 pt-1 space-y-3.5 border-t border-gray-100">
          {/* Pencari properti */}
          <div>
            <span className="block text-sm font-medium text-[#0F172A] mb-1.5">Properti</span>
            {dipilih ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 border border-[#1565C0]/30 bg-[#F0F7FF] rounded-xl">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[#0F172A] truncate">{dipilih.title}</div>
                  <div className="flex items-center flex-wrap gap-1.5 mt-0.5">
                    <span className="text-[11px] text-[#64748B]">{dipilih.kode_listing} · {dipilih.jenis_properti}</span>
                    {!agentCocok(spesialis, dipilih.jenis_properti) && <ChipLuarSpesialis />}
                  </div>
                </div>
                <button type="button" onClick={() => setDipilih(null)} disabled={sibuk}
                  className="p-1 rounded-lg text-[#94A3B8] hover:text-[#1565C0] hover:bg-white flex-shrink-0" title="Ganti properti">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                  <input value={cari} onChange={e => setCari(e.target.value)}
                    placeholder="Cari judul atau kode listing…"
                    className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0]" />
                </div>
                <div className="mt-1.5 max-h-48 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                  {loadingProperti ? (
                    <div className="py-6 text-center"><Loader2 size={16} className="animate-spin mx-auto text-[#94A3B8]" /></div>
                  ) : hasilCari.length === 0 ? (
                    <p className="text-xs text-[#94A3B8] p-3">
                      {kandidat.length === 0
                        ? 'Belum ada listing.'
                        : 'Tidak ada listing yang cocok dengan pencarian.'}
                    </p>
                  ) : (
                    hasilCari.slice(0, 50).map(p => (
                      <button key={p.id} type="button" onClick={() => { setDipilih(p); setCari(''); }}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[#F0F7FF]">
                        <div className="min-w-0">
                          <div className="text-sm text-[#0F172A] truncate">{p.title}</div>
                          <div className="flex items-center flex-wrap gap-1.5 mt-0.5">
                            <span className="text-[11px] text-[#94A3B8]">{p.kode_listing} · {p.jenis_properti}</span>
                            {!agentCocok(spesialis, p.jenis_properti) && <ChipLuarSpesialis />}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          <label className="block">
            <span className="block text-sm font-medium text-[#0F172A] mb-1.5">File video</span>
            <input
              type="file" accept="video/*"
              onChange={e => { setFile(e.target.files?.[0] ?? null); setError(''); }}
              disabled={sibuk}
              className="w-full text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#EFF6FF] file:text-[#1565C0]"
            />
            {file && (
              <span className="block text-[11px] text-[#94A3B8] mt-1">
                {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
              </span>
            )}
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-[#0F172A] mb-1.5">Caption <span className="font-normal text-[#94A3B8]">(opsional)</span></span>
            <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={4} disabled={sibuk}
              placeholder="Tempel caption yang sudah dibuat…"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] leading-relaxed" />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-[#0F172A] mb-1.5">Hashtag <span className="font-normal text-[#94A3B8]">(opsional)</span></span>
            <input value={hashtags} onChange={e => setHashtags(e.target.value)} disabled={sibuk}
              placeholder="#rumahjogja #propertijogja"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0]" />
          </label>

          {error && <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl p-3 text-sm">{error}</div>}
          {sukses && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl p-3 text-sm">
              <Check size={14} /> {sukses}
            </div>
          )}
          {tahap && (
            <div className="flex items-center gap-2 text-sm text-[#64748B]">
              <Loader2 size={15} className="animate-spin" /> {tahap}
            </div>
          )}

          <button
            onClick={unggah} disabled={!file || !dipilih || sibuk}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
            <Upload size={15} /> {sibuk ? 'Mengunggah…' : 'Unggah video'}
          </button>
          <p className="text-[11px] text-[#94A3B8]">
            Video diunggah langsung ke R2 (bucket sbp-video). Tidak perlu pesanan/storyboard.
          </p>
        </div>
      )}
    </div>
  );
}
