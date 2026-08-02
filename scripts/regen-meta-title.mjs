// Regenerasi meta_title seluruh properti memakai generateMetaSeo() yang sudah
// diperbaiki (kelurahan + LT/LB + harga).
//
// LATAR: template lama hanya jenis+tujuan+kecamatan+kabupaten+harga, tanpa pembeda
// unik — 214 dari 533 properti (40%) berjudul kembar. Lihat komentar di metaSeo.js.
//
// PEMAKAIAN:
//   node scripts/regen-meta-title.mjs            -> DRY-RUN (default, tidak menulis)
//   node scripts/regen-meta-title.mjs --tulis    -> menulis ke D1 produksi
//
// Dry-run mencetak contoh sebelum/sesudah + hitungan sisa kembar + pelanggaran
// panjang. JANGAN pakai --tulis sebelum hasil dry-run diperiksa manusia.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateMetaSeo } from '../functions/_lib/metaSeo.js';

const TULIS = process.argv.includes('--tulis');
const DB = 'sbp-db';
const MAX_LEN = 60;
// Batas resmi D1: 100 bound parameter per query. Tiap baris memakai 2 (nilai + id).
const CHUNK = 45;

// ⚠️ Dua jebakan yang sudah memakan waktu — jangan diulang:
//  1. `--file` TIDAK mengembalikan baris data, hanya RINGKASAN eksekusi
//     ("Total queries executed / Rows read"). Untuk membaca hasil WAJIB `--command`.
//     Memakai --file untuk SELECT membuat skrip ini melaporkan "1 properti" padahal
//     ada 533, dan seluruh statistik dry-run jadi omong kosong yang terlihat hijau.
//  2. Memanggil `npx`/`npx.cmd` lewat execFileSync di Windows/Node 24 gagal: tanpa
//     shell → EINVAL, dengan shell → argumen dipecah di setiap spasi sehingga SQL
//     rusak. Jalan yang bersih: panggil entry JS wrangler langsung dengan node,
//     tanpa shell sama sekali, sehingga argumen dilewatkan apa adanya.
const WRANGLER = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
function d1(sql) {
  const out = execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', DB, '--remote', '--json', '--command', sql], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  // ⚠️ JANGAN pakai out.indexOf('[') — wrangler mencetak banner sebelum JSON, dan
  // '[' pertama sering milik banner itu. Akibatnya JSON.parse "berhasil" atas
  // potongan yang salah dan skrip melaporkan 1 baris padahal ada 533 — dry-run
  // hijau di atas data sampah. Cari awal blok JSON yang sesungguhnya.
  const cocok = out.match(/\[\s*\{\s*"results"/);
  if (!cocok) throw new Error('Blok JSON hasil D1 tidak ditemukan di keluaran wrangler');
  const data = JSON.parse(out.slice(cocok.index));
  if (!Array.isArray(data) || !Array.isArray(data[0]?.results)) {
    throw new Error('Bentuk keluaran D1 tidak sesuai harapan');
  }
  return data[0].results;
}

// TULIS lewat `--file`. UPDATE dengan puluhan judul mudah melewati batas panjang
// argumen Windows (~32 KB) → spawnSync ENAMETOOLONG. Operasi tulis tidak butuh
// baris hasil, jadi ringkasan dari `--file` sudah cukup.
const TMP = mkdtempSync(join(tmpdir(), 'sbp-meta-'));
let seq = 0;
function d1Tulis(sql) {
  const berkas = join(TMP, `w${seq++}.sql`);
  writeFileSync(berkas, sql, 'utf8');
  execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', DB, '--remote', '--json', '--file', berkas], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
}

const rows = d1(`SELECT id, jenis_properti, tujuan, harga, kelurahan, kecamatan,
                        kabupaten, luas_tanah, luas_bangunan, nego, meta_title
                 FROM properties ORDER BY id`);
console.log(`Dibaca ${rows.length} properti dari D1 produksi.\n`);

const rencana = [];
for (const r of rows) {
  const { meta_title } = generateMetaSeo(r);
  if (meta_title !== r.meta_title) rencana.push({ id: r.id, lama: r.meta_title ?? '', baru: meta_title });
}

// ── Statistik sesudah ──
const semuaBaru = rows.map(r => generateMetaSeo(r).meta_title);
const hitung = new Map();
for (const t of semuaBaru) hitung.set(t, (hitung.get(t) ?? 0) + 1);
const kembar = [...hitung.values()].filter(n => n > 1);
const propKembar = kembar.reduce((a, b) => a + b, 0);
const terpanjang = Math.max(...semuaBaru.map(t => t.length));
const terpotong = semuaBaru.filter(t => t.endsWith('...')).length;
const kosong = semuaBaru.filter(t => !t.trim()).length;

console.log('=== CONTOH PERUBAHAN (20 pertama) ===');
for (const p of rencana.slice(0, 20)) {
  console.log(`  #${p.id}`);
  console.log(`    lama : ${p.lama || '(KOSONG)'}`);
  console.log(`    baru : ${p.baru}  [${p.baru.length}]`);
}

console.log('\n=== RINGKASAN ===');
console.log(`  baris berubah      : ${rencana.length}`);
console.log(`  properti kembar    : ${propKembar}  (sebelumnya 214)`);
console.log(`  panjang maksimum   : ${terpanjang}  (batas ${MAX_LEN})`);
console.log(`  judul terpotong ...: ${terpotong}`);
console.log(`  judul kosong       : ${kosong}`);

let gagal = 0;
if (terpanjang > MAX_LEN) { console.error('GAGAL: ada judul melebihi batas'); gagal++; }
if (kosong > 0) { console.error('GAGAL: ada judul kosong'); gagal++; }
if (propKembar > 5) { console.error(`GAGAL: masih ${propKembar} properti kembar`); gagal++; }
// Judul terpotong '...' membuang harga + brand di ekor — generator seharusnya
// menyusut bertahap, bukan memotong buta. Kalau ini > 0, penyusutannya bocor.
if (terpotong > 0) { console.error(`GAGAL: ${terpotong} judul masih terpotong '...'`); gagal++; }
if (gagal) process.exit(1);

if (!TULIS) {
  console.log('\nDRY-RUN — tidak ada yang ditulis. Jalankan ulang dengan --tulis bila hasil di atas benar.');
  process.exit(0);
}

console.log(`\nMenulis ${rencana.length} baris ke D1 produksi…`);
let ditulis = 0;
for (let i = 0; i < rencana.length; i += CHUNK) {
  const bagian = rencana.slice(i, i + CHUNK);
  const cases = bagian.map(p => `WHEN ${p.id} THEN '${p.baru.replace(/'/g, "''")}'`).join(' ');
  const ids = bagian.map(p => p.id).join(',');
  d1Tulis(`UPDATE properties SET meta_title = CASE id ${cases} END, updated_at = CURRENT_TIMESTAMP WHERE id IN (${ids});`);
  ditulis += bagian.length;
  console.log(`  ${ditulis}/${rencana.length}`);
}
console.log('Selesai.');
