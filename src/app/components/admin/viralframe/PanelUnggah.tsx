// STASIUN 7 — ASET. Menutup loop: video hasil render di Google Flow diunggah
// kembali, dicatat, lalu diserahkan ke mesin distribusi yang SUDAH berjalan.
//
// ─── Kenapa unggah langsung ke R2, bukan lewat Worker ────────────────────────
// File 20–50 MB dari koneksi rumahan bisa melewati wall-clock Worker 30 detik
// kalau body-nya harus mengalir lewat sana. Karena itu presigned PUT: browser
// menembak R2 langsung, kredensial S3 tidak pernah meninggalkan server.
//
// ─── Kenapa poster digambar di browser ───────────────────────────────────────
// Dulu poster dibuat dengan mengubah URL video Cloudinary jadi .jpg. Itu ditagih
// sebagai transformasi VIDEO per detik durasi × bobot resolusi — terukur 51% dari
// kuota bulanan hanya untuk 160 gambar sampul ~46 KB. `buatPosterDariVideo()`
// menggambarnya lewat <canvas>, nol biaya, DAN jadi satu-satunya sumber
// width/height/duration sejak pindah ke R2 (dulu ketiganya datang dari respons
// Cloudinary). Melewatinya membuat filter rasio di Konten Agent kehilangan
// dasarnya tanpa error apa pun.
import { useState } from 'react';
import { Upload, Loader2, Check, Type } from 'lucide-react';
import { bacaJson } from '../../../../lib/api';
import { buatPosterDariVideo } from '../../../lib/posterVideo';

interface Presign {
  key: string; posterKey: string;
  uploadUrl: string; posterUploadUrl: string;
  publicUrl: string; posterPublicUrl: string;
}

export default function PanelUnggah({ order, captionAwal = '', hashtagAwal = '', onSelesai }: {
  order: { id: number; property_id: number; character_id: number; title: string };
  /** Caption & hashtag yang SUDAH tersimpan di pesanan — nilai awal saat panel dibuka. */
  captionAwal?: string;
  hashtagAwal?: string;
  onSelesai: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  // ⚠️ `useState(nilaiAwal)` hanya membaca prop SEKALI, saat mount. Itu benar
  // untuk kasus buka-ulang (caption sudah tersimpan di pesanan), tapi SALAH untuk
  // caption yang dibuat SETELAH panel ini terpasang — nilainya tidak akan pernah
  // sampai ke kolom, dan user melihat kotak yang tetap kosong tanpa error apa pun.
  //
  // Itulah kenapa tombol pembuatnya sekarang ADA DI SINI dan mengisi state ini
  // langsung, bukan di kartu terpisah yang mengoper lewat prop. Tombol yang
  // mengisi sebuah kolom harus duduk di sebelah kolom itu — bukan cuma soal
  // tata letak, tapi supaya tidak ada jalur data yang bisa putus di tengah.
  const [caption, setCaption] = useState(captionAwal);
  const [hashtags, setHashtags] = useState(hashtagAwal);
  const [tahap, setTahap] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [buatSibuk, setBuatSibuk] = useState(false);
  const [error, setError] = useState('');
  const [beres, setBeres] = useState(false);

  /** Buat caption + hashtag dari storyboard, lalu isi kedua kolom di bawah. */
  const buatCaption = async () => {
    if (sibuk || buatSibuk) return;
    setBuatSibuk(true); setError('');
    try {
      const res = await fetch(`/api/admin/viralframe/orders/${order.id}/caption`, {
        method: 'POST', credentials: 'include',
      });
      const json = await bacaJson<{ caption?: string; hashtags?: string }>(res);
      if (!json.success || !json.data) { setError(json.error ?? 'Gagal membuat caption.'); return; }
      setCaption(json.data.caption ?? '');
      setHashtags(json.data.hashtags ?? '');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal membuat caption.');
    } finally {
      setBuatSibuk(false);
    }
  };

  const unggah = async () => {
    if (!file || sibuk) return;
    setSibuk(true); setError(''); setTahap('Membaca video…');
    try {
      // 1. Poster + dimensi + durasi — SEBELUM presign, supaya video yang
      //    codecnya tidak didukung browser gagal lebih awal, sebelum apa pun
      //    terlanjur diunggah dan jadi objek yatim di R2.
      const poster = await buatPosterDariVideo(file);

      setTahap('Menyiapkan tempat unggah…');
      const pres = await fetch('/api/admin/viralframe/r2-sign', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: order.property_id, character_id: order.character_id }),
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
      // Sampul gagal TIDAK membatalkan videonya — videonya sudah aman di R2 dan
      // itu yang mahal. Poster hanya memengaruhi tampilan daftar.
      const posterUrl = putPoster.ok ? p.posterPublicUrl : null;

      setTahap('Mencatat video…');
      const simpan = await fetch('/api/admin/viralframe/agent-videos', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character_id: order.character_id,
          property_id: order.property_id,
          storage: 'r2',
          r2_key: p.key,
          cloudinary_url: p.publicUrl,   // baca sebagai "URL publik" (migrasi 0043)
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

      setTahap('Menutup pesanan…');
      await fetch(`/api/admin/viralframe/orders/${order.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'selesai', video_id: simpanJson.data?.id ?? null }),
      });

      setBeres(true);
      setTahap('');
      onSelesai();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal mengunggah.');
      setTahap('');
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-display font-bold text-[#0F172A] text-sm">Unggah hasil render</h2>
          <p className="text-xs text-[#64748B] truncate">{order.title}</p>
        </div>

        <div className="p-4 space-y-3.5">
          {beres ? (
            <div className="text-center py-6">
              <div className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                <Check size={22} />
              </div>
              <p className="text-sm font-semibold text-[#0F172A]">Video tercatat</p>
              <p className="text-xs text-[#64748B] mt-1">
                Pesanan ditutup. Penjadwal otomatis akan mengambilnya pada siklus berikutnya.
              </p>
            </div>
          ) : (
            <>
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

              {/* Tombol pengisi duduk tepat di atas kolom yang diisinya. */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <button
                  type="button"
                  onClick={buatCaption}
                  disabled={sibuk || buatSibuk}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
                  style={{ background: '#0891B2' }}>
                  {buatSibuk ? <Loader2 size={13} className="animate-spin" /> : <Type size={13} />}
                  {buatSibuk ? 'Membuat…' : (caption ? 'Buat ulang caption + hashtag' : 'Buat caption + hashtag')}
                </button>
                <span className="text-[11px] text-[#94A3B8]">
                  Dari storyboard — ikut rotasi, hashtag merek &amp; lokasi tetap sama.
                </span>
              </div>

              <label className="block">
                <span className="block text-sm font-medium text-[#0F172A] mb-1.5">Caption <span className="font-normal text-[#94A3B8]">(opsional)</span></span>
                <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={5} disabled={sibuk}
                  placeholder="Tulis sendiri, atau tekan “Buat caption + hashtag” di atas."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0] leading-relaxed" />
              </label>

              <label className="block">
                <span className="block text-sm font-medium text-[#0F172A] mb-1.5">Hashtag <span className="font-normal text-[#94A3B8]">(opsional)</span></span>
                <input value={hashtags} onChange={e => setHashtags(e.target.value)} disabled={sibuk}
                  placeholder="#rumahjogja #propertijogja"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1565C0]" />
              </label>

              {error && <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl p-3 text-sm">{error}</div>}
              {tahap && (
                <div className="flex items-center gap-2 text-sm text-[#64748B]">
                  <Loader2 size={15} className="animate-spin" /> {tahap}
                </div>
              )}

              <button
                onClick={unggah} disabled={!file || sibuk}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #1565C0 0%, #29B6F6 100%)' }}>
                <Upload size={15} /> {sibuk ? 'Mengunggah…' : 'Unggah & tutup pesanan'}
              </button>
              <p className="text-[11px] text-[#94A3B8]">
                Video diunggah langsung ke R2 (bucket sbp-video). Sampul digambar di browser — nol biaya transformasi.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
