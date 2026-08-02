// Perbaiki karakter rusak sisa impor pada `title` & `deskripsi` properti.
//
// LATAR: 48 judul dan 72 deskripsi memuat '?' yang seharusnya karakter lain —
// em-dash hilang saat impor ("Gejayan ? Manajemen"), begitu juga huruf beraksen
// ("Caf?" untuk "Café"). Teks ini tampil sebagai H1 halaman dan cuplikan Google.
//
// KEBIJAKAN (dipilih user 2026-08-03): HANYA perbaiki yang PASTI.
//   AMAN   : ' ? ' di antara dua karakter kata  ->  ' — '
//            Tanda tanya yang sah menempel pada kata sebelumnya ("Apa?"), tidak
//            pernah berdiri sendiri di antara dua spasi. Jadi polanya diskriminatif.
//   AMBIGU : 'Caf?', '??', '?13'  -> TIDAK DISENTUH, hanya didaftar untuk dikoreksi
//            manual lewat panel admin. Menebak huruf beraksen berisiko menyimpan
//            kesalahan permanen ke konten listing.
//
// PEMAKAIAN:
//   node scripts/perbaiki-karakter-rusak.mjs           -> DRY-RUN (default)
//   node scripts/perbaiki-karakter-rusak.mjs --tulis   -> menulis ke D1 produksi

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TULIS = process.argv.includes('--tulis');
const DB = 'sbp-db';
const CHUNK = 40;

// Lihat catatan panjang di scripts/regen-meta-title.mjs: `--file` hanya mengembalikan
// RINGKASAN (bukan baris), dan memanggil npx lewat shell merusak argumen SQL.
const WRANGLER = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
function d1(sql) {
  const out = execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', DB, '--remote', '--json', '--command', sql], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  const cocok = out.match(/\[\s*\{\s*"results"/);
  if (!cocok) throw new Error('Blok JSON hasil D1 tidak ditemukan');
  const data = JSON.parse(out.slice(cocok.index));
  if (!Array.isArray(data?.[0]?.results)) throw new Error('Bentuk keluaran D1 tak sesuai');
  return data[0].results;
}

// TULIS lewat `--file`, bukan `--command`. UPDATE yang memuat deskripsi utuh dengan
// mudah melewati batas panjang argumen Windows (~32 KB) → spawnSync ENAMETOOLONG.
// Untuk operasi tulis kita memang tidak butuh baris hasil, jadi ringkasan yang
// dikembalikan `--file` sudah cukup.
const TMP = mkdtempSync(join(tmpdir(), 'sbp-fix-'));
let seq = 0;
function d1Tulis(sql) {
  const berkas = join(TMP, `w${seq++}.sql`);
  writeFileSync(berkas, sql, 'utf8');
  execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', DB, '--remote', '--json', '--file', berkas], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
}

// DUA pola berbeda — menyamaratakannya merusak data.
//   PLUSMINUS : "Luas Bangunan: ? 600 m²"  -> '±' (kurang-lebih), BUKAN em-dash.
//               Cirinya: titik dua (label) lalu '?' lalu ANGKA.
//   EMDASH    : "(Negotiable) ? Harga...", "630 m² ? ruang..." -> em-dash.
//               Batas kiri sengaja mencakup ')' dan '²' — versi pertama skrip ini
//               hanya menerima \w sehingga 27 deskripsi terlewat diam-diam.
// Urutan penting: ± diperiksa LEBIH DULU, kalau tidak em-dash akan menelannya.
const PLUSMINUS = /:\s\?\s(?=\d)/g;
const EMDASH = /([\w)\]%²°])\s\?\s(?=[\w(])/g;

// GELOMBANG 2 (2026-08-03) — ditambahkan SETELAH melihat ke-37 baris sisa utuh.
// Waktu baru terlihat 4 contoh, kedua pola ini masih tampak menebak; dengan daftar
// penuh, keduanya terbukti berulang dengan bentuk identik.
//
//   PLUSMINUS_RAPAT : '?400 m²', '?13 Kamar', '(?6 meter)'  -> '±'
//     Lookbehind SENGAJA hanya spasi/titik-dua/bullet/dash/kurung — BUKAN digit —
//     supaya '140?200' (ukuran kasur, seharusnya '140×200') TIDAK ikut berubah.
//   EMOJI_HILANG : '??' / '????' -> dibuang.
//     Emoji di luar BMP jadi SEPASANG '?' saat impor rusak, jadi runtun genap
//     pendek = emoji hiasan. Tampil sebagai tanda tanya ganda di cuplikan Google.
//     ⚠️ Runtun PANJANG (≥6) dibiarkan — itu KATA yang hilang, bukan hiasan
//     (mis. #651 '???????? ????????????' = frasa utuh). Membuangnya menghapus
//     makna, bukan memperbaiki tampilan.
const PLUSMINUS_RAPAT = /(?<=[\s:•\-(])\?(?=\d)/g;
// ⚠️ `(?<!\?)` dan `(?!\?)` WAJIB ada. Tanpa keduanya, runtun panjang tergigit
// SEBAGIAN — '????????' (8) kehilangan 5 dan menyisakan '???', yang lebih buruk
// daripada dibiarkan utuh. Batas 4 = maksimal 2 emoji; runtun lebih panjang
// hampir pasti KATA yang hilang, jadi dibiarkan untuk koreksi manual.
const EMOJI_HILANG = /\s*(?<!\?)\?{2,4}(?!\?)(?=\s|$|•)/g;

const perbaiki = (s) => String(s ?? '')
  .replace(PLUSMINUS, ': ± ')
  .replace(EMDASH, '$1 — ')
  .replace(PLUSMINUS_RAPAT, '±')
  .replace(EMOJI_HILANG, '')
  .replace(/[ \t]{2,}/g, ' ');

const rows = d1(`SELECT id, title, deskripsi FROM properties
                 WHERE title LIKE '%?%' OR deskripsi LIKE '%?%' ORDER BY id`);
console.log(`Dibaca ${rows.length} properti yang memuat '?'.\n`);

const rencana = [];
const ambigu = [];
for (const r of rows) {
  const judulBaru = perbaiki(r.title);
  const deskBaru = perbaiki(r.deskripsi);
  if (judulBaru !== r.title || deskBaru !== r.deskripsi) {
    rencana.push({ id: r.id, judulBaru, deskBaru, ubahJudul: judulBaru !== r.title, ubahDesk: deskBaru !== r.deskripsi });
  }
  // ⚠️ JANGAN melaporkan setiap sisa '?' sebagai rusak. Sebagian besar teks memang
  // memuat tanda tanya yang SAH ("Mengapa Memilih Kami?", "TV Android 32?" = inci).
  // Versi pertama skrip ini menandai 175 baris sebagai "ambigu" padahal ~171 di
  // antaranya baik-baik saja — laporan seperti itu menyuruh user mengejar hantu.
  // Hanya dua pola yang benar-benar mencurigakan:
  //   (a) '??' berturut-turut  — hampir selalu sisa karakter khusus/emoji
  //   (b) '?' langsung menempel alfanumerik tanpa spasi ('?13 Kamar')
  const MENCURIGAKAN = /\?\?|\?(?=[A-Za-z0-9])/;
  for (const [kolom, teks] of [['title', judulBaru], ['deskripsi', deskBaru]]) {
    const m = teks.match(MENCURIGAKAN);
    if (m) {
      const i = m.index;
      ambigu.push({ id: r.id, kolom, cuplikan: teks.slice(Math.max(0, i - 30), i + 25).replace(/\s+/g, ' ') });
    }
  }
}

console.log('=== CONTOH PERBAIKAN AMAN (10 pertama) ===');
for (const p of rencana.filter(x => x.ubahJudul).slice(0, 10)) {
  console.log(`  #${p.id}: ${p.judulBaru.slice(0, 72)}`);
}

console.log(`\n=== MENCURIGAKAN — TIDAK DISENTUH, koreksi manual (${ambigu.length}) ===`);
console.log('    (tanda tanya yang sah TIDAK didaftar di sini)');
for (const a of ambigu) console.log(`  #${a.id} [${a.kolom}] …${a.cuplikan}…`);

console.log('\n=== RINGKASAN ===');
console.log(`  baris diperbaiki : ${rencana.length}`);
console.log(`  judul diperbaiki : ${rencana.filter(x => x.ubahJudul).length}`);
console.log(`  deskripsi        : ${rencana.filter(x => x.ubahDesk).length}`);
console.log(`  dilewati (ambigu): ${ambigu.length}`);

if (!TULIS) {
  console.log("\nDRY-RUN — tidak ada yang ditulis. Jalankan ulang dengan --tulis bila benar.");
  process.exit(0);
}

const esc = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`;
console.log(`\nMenulis ${rencana.length} baris ke D1 produksi…`);
let n = 0;
for (let i = 0; i < rencana.length; i += CHUNK) {
  const bagian = rencana.slice(i, i + CHUNK);
  const casesJudul = bagian.map(p => `WHEN ${p.id} THEN ${esc(p.judulBaru)}`).join(' ');
  const casesDesk = bagian.map(p => `WHEN ${p.id} THEN ${esc(p.deskBaru)}`).join(' ');
  const ids = bagian.map(p => p.id).join(',');
  d1Tulis(`UPDATE properties SET title = CASE id ${casesJudul} END,
                                 deskripsi = CASE id ${casesDesk} END,
                                 updated_at = CURRENT_TIMESTAMP
           WHERE id IN (${ids});`);
  n += bagian.length;
  console.log(`  ${n}/${rencana.length}`);
}
console.log('Selesai.');
