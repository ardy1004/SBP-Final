// Perbaikan TERAKHIR karakter rusak — per ID, BUKAN pola umum.
//
// LATAR: `perbaiki-karakter-rusak.mjs` sudah menghabiskan semua pola yang bisa
// digeneralisasi (em-dash ber-spasi, '±', emoji hiasan). Sisanya 9 baris yang
// hanya bisa dibaca dari KALIMATNYA, bukan dari bentuk karakternya. Menuliskan
// regex untuk kasus seperti ini berbahaya: pola 'kata?kata' juga cocok dengan
// kalimat tanya yang sah yang kebetulan kehilangan spasi.
//
// Karena itu tiap baris diperbaiki dengan pasangan cari→ganti EKSPLISIT dan
// diverifikasi cocok tepat 1× sebelum ditulis. Kalau tidak cocok (mis. baris
// sudah diedit manual), baris itu DILEWATI dengan peringatan — tidak dipaksakan.
//
// #651 SENGAJA TIDAK ADA DI SINI: '• ???????? ????????????. •' adalah dua KATA
// yang hilang, bukan hiasan. Hanya pemilik listing yang tahu aslinya apa.
//
// PEMAKAIAN:
//   node scripts/perbaiki-karakter-sisa.mjs           -> DRY-RUN
//   node scripts/perbaiki-karakter-sisa.mjs --tulis   -> tulis ke D1 produksi

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TULIS = process.argv.includes('--tulis');
const DB = 'sbp-db';

// Dasar tiap bacaan ada di kolom `alasan` — supaya bisa diaudit ulang, bukan
// sekadar "percaya saja".
const PERBAIKAN = [
  { id: 471, kolom: 'deskripsi', cari: 'Sangat baik?tidak pernah kosong', ganti: 'Sangat baik — tidak pernah kosong',
    alasan: '"Sangat baik" bukan pertanyaan; kalimat berlanjut' },
  { id: 710, kolom: 'deskripsi', cari: '50 MBPS?semua aktif', ganti: '50 MBPS — semua aktif',
    alasan: 'spesifikasi lalu keterangan, bukan pertanyaan' },
  { id: 865, kolom: 'deskripsi', cari: 'stabil?dapatkan income', ganti: 'stabil — dapatkan income',
    alasan: 'kalimat ajakan berlanjut, bukan pertanyaan' },
  { id: 874, kolom: 'deskripsi', cari: 'waiting list?sebuah bukti', ganti: 'waiting list — sebuah bukti',
    alasan: 'apposisi ("sebuah bukti..."), bukan pertanyaan' },
  { id: 516, kolom: 'deskripsi', cari: 'ukuran 140?200', ganti: 'ukuran 140×200',
    alasan: 'ukuran springbed standar 140x200 cm' },
  { id: 675, kolom: 'deskripsi', cari: '- ?sertifikat atas nama', ganti: '- Sertifikat atas nama',
    alasan: 'sejajar butir lain yang diawali "- "; tanda hilang di awal kata' },
  { id: 773, kolom: 'deskripsi', cari: '- ?Rooftop', ganti: '- Rooftop',
    alasan: 'sejajar "- Garasi", "- Ruang TV" di daftar yang sama' },
  // Tanda tanya di sini diikuti DUA baris baru, bukan spasi — pola cari pertama
  // meleset dan dry-run melewatinya (penjaga "harus cocok tepat 1×" bekerja).
  { id: 911, kolom: 'deskripsi', cari: 'DIA DAPAT! ??????????', ganti: 'DIA DAPAT!',
    alasan: '10 tanda = 5 emoji hiasan yang hilang saat impor' },
];

const WRANGLER = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
function d1Baca(sql) {
  const out = execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', DB, '--remote', '--json', '--command', sql],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const cocok = out.match(/\[\s*\{\s*"results"/);
  if (!cocok) throw new Error('Blok JSON hasil D1 tidak ditemukan');
  return JSON.parse(out.slice(cocok.index))[0].results;
}
const TMP = mkdtempSync(join(tmpdir(), 'sbp-sisa-'));
let seq = 0;
function d1Tulis(sql) {
  const berkas = join(TMP, `w${seq++}.sql`);
  writeFileSync(berkas, sql, 'utf8');
  execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', DB, '--remote', '--json', '--file', berkas],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// Perbaikan BER-POLA tapi DIBATASI ke ID tertentu. Dipakai saat satu baris memuat
// BANYAK kejadian pola yang sama — cari→ganti eksplisit hanya menyentuh yang pertama.
// Ditemukan setelah gelombang pertama: #675 dan #773 masing-masing punya beberapa
// butir daftar yang penanda awalnya hilang ('- ?akses', '* ?Dapur').
// ⚠️ #651 SENGAJA tidak masuk daftar ID ini meski juga cocok pola '• ?' — di sana
// tanda tanyanya bagian dari runtun kata yang hilang, bukan penanda butir.
const POLA_TERBATAS = [
  {
    ids: [675, 773],
    kolom: 'deskripsi',
    pola: /([-*•]\s)\?(?=[A-Za-z])/g,
    ganti: '$1',
    alasan: 'penanda butir hilang di awal kata (sejajar butir lain di daftar yang sama)',
  },
];

const ids = [...new Set([...PERBAIKAN.map(p => p.id), ...POLA_TERBATAS.flatMap(p => p.ids)])].join(',');
const rows = d1Baca(`SELECT id, deskripsi FROM properties WHERE id IN (${ids})`);
const byId = new Map(rows.map(r => [r.id, r]));

const siap = [];
let lewat = 0;
for (const p of PERBAIKAN) {
  const teks = byId.get(p.id)?.[p.kolom];
  if (teks == null) { console.log(`  LEWAT #${p.id}: baris tidak ditemukan`); lewat++; continue; }
  const jumlah = teks.split(p.cari).length - 1;
  if (jumlah !== 1) {
    console.log(`  LEWAT #${p.id}: pola cocok ${jumlah}× (harus tepat 1) — mungkin sudah diedit manual`);
    lewat++; continue;
  }
  siap.push({ ...p, baru: teks.replace(p.cari, p.ganti) });
  console.log(`  SIAP  #${p.id}: "${p.cari}" -> "${p.ganti}"`);
  console.log(`         alasan: ${p.alasan}`);
}

// Terapkan pola ber-cakupan ID di ATAS hasil cari→ganti eksplisit, supaya kedua
// jenis perbaikan pada baris yang sama tidak saling menimpa.
for (const p of POLA_TERBATAS) {
  for (const id of p.ids) {
    const sudah = siap.find(s => s.id === id);
    const teks = sudah ? sudah.baru : byId.get(id)?.[p.kolom];
    if (teks == null) { console.log(`  LEWAT #${id}: baris tidak ditemukan`); continue; }
    const baru = teks.replace(p.pola, p.ganti);
    if (baru === teks) continue;
    const n = (teks.match(p.pola) ?? []).length;
    if (sudah) sudah.baru = baru;
    else siap.push({ id, kolom: p.kolom, baru });
    console.log(`  SIAP  #${id}: ${n}× penanda butir dipulihkan`);
    console.log(`         alasan: ${p.alasan}`);
  }
}

console.log(`\n=== RINGKASAN ===\n  siap ditulis : ${siap.length}\n  dilewati     : ${lewat}`);
console.log('  #651 sengaja TIDAK termasuk (2 kata hilang, hanya pemilik listing yang tahu)');

if (!TULIS) { console.log('\nDRY-RUN — tidak ada yang ditulis.'); process.exit(0); }
if (siap.length === 0) { console.log('\nTidak ada yang perlu ditulis.'); process.exit(0); }

const esc = (s) => `'${String(s).replace(/'/g, "''")}'`;
const cases = siap.map(p => `WHEN ${p.id} THEN ${esc(p.baru)}`).join(' ');
d1Tulis(`UPDATE properties SET deskripsi = CASE id ${cases} END, updated_at = CURRENT_TIMESTAMP
         WHERE id IN (${siap.map(p => p.id).join(',')});`);
console.log(`\n${siap.length} baris ditulis. Selesai.`);
