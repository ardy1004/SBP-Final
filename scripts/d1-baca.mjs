#!/usr/bin/env node
// scripts/d1-baca.mjs — jalankan SATU query BACA ke D1 (default: produksi sbp-db).
//
//   node scripts/d1-baca.mjs "SELECT id, nama FROM viralframe_characters"
//   node scripts/d1-baca.mjs --json "SELECT …"     → keluaran JSON mentah (baris)
//   node scripts/d1-baca.mjs --lokal "SELECT …"    → D1 lokal, bukan produksi
//   node scripts/d1-baca.mjs --cek "…"             → hanya validasi, tidak dijalankan
//
// Kenapa ada (2026-11-21): pemeriksa keamanan Claude Code kadang menolak query
// baca ke D1 produksi. Mengizinkan `wrangler d1 execute --remote` secara umum
// tidak bisa membedakan baca dari tulis, jadi yang diizinkan (di
// .claude/settings.local.json) HANYA skrip ini — dan skrip ini menolak apa pun
// selain satu pernyataan SELECT. Perintah yang MENGUBAH database tetap lewat
// jalur biasa yang diperiksa ketat.
//
// Aturan penolakan (sengaja ketat; lebih baik menolak query sah daripada
// meloloskan tulis):
//   · wajib diawali SELECT atau WITH;
//   · tepat satu pernyataan (titik koma hanya boleh di paling akhir);
//   · tanpa komentar (-- atau /* */) — komentar bisa menyembunyikan isi;
//   · tanpa kata kunci tulis/DDL/transaksi di LUAR literal string & nama
//     berkutip (INSERT, UPDATE, DELETE, REPLACE, DROP, ALTER, CREATE, ATTACH,
//     DETACH, PRAGMA, VACUUM, REINDEX, ANALYZE, BEGIN, COMMIT, ROLLBACK,
//     SAVEPOINT, RELEASE, RETURNING). Catatan: `WITH … DELETE` sah di SQLite,
//     makanya pemeriksaan kata kunci tetap jalan walau diawali WITH. Fungsi
//     tabel `pragma_table_info('x')` tetap boleh (bukan kata kunci PRAGMA).
//
// Nilai kolom bernama rahasia (api_key, secret, password, token, hash, nik)
// DISAMARKAN di keluaran — pengaman kebiasaan supaya kunci tidak tercetak ke
// layar/log, bukan batas keamanan (alias kolom bisa melewatinya).
//
// Pola pemanggilan wrangler mengikuti skill d1-migrations-and-scripts: node
// langsung ke wrangler.js (tanpa npx/shell), `--command` untuk baca, JSON
// keluaran dipotong dengan regex `[{"results"`.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const DB = 'sbp-db';

// REPLACE sengaja hanya ditolak sebagai `REPLACE INTO` (pernyataan tulis):
// fungsi teks replace(x,'a','b') lazim dan sah di SELECT.
const KATA_TERLARANG = [
  'INSERT', 'UPDATE', 'DELETE', 'REPLACE\\s+INTO', 'DROP', 'ALTER', 'CREATE', 'ATTACH', 'DETACH',
  'PRAGMA', 'VACUUM', 'REINDEX', 'ANALYZE', 'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',
  'RELEASE', 'RETURNING',
];
const KOLOM_RAHASIA = /(api_key|secret|password|token|hash|(^|_)nik($|_))/i;

/** Buang isi literal string & nama berkutip supaya kata di dalamnya tidak ikut dinilai. */
function tanpaLiteral(sql) {
  let out = '';
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const tutup = c === "'" ? "'" : c === '"' ? '"' : c === '`' ? '`' : c === '[' ? ']' : null;
    if (!tutup) { out += c; continue; }
    // Lompati sampai penutup; '' / "" di dalam = tanda kutip ter-escape.
    let j = i + 1;
    for (; j < sql.length; j++) {
      if (sql[j] === tutup) {
        if ((tutup === "'" || tutup === '"') && sql[j + 1] === tutup) { j++; continue; }
        break;
      }
    }
    if (j >= sql.length) throw new Error('literal/kutipan tidak ditutup');
    out += ' ? ';
    i = j;
  }
  return out;
}

/** @returns {string|null} alasan penolakan, atau null bila aman. */
export function periksaQuery(sql) {
  if (typeof sql !== 'string' || !sql.trim()) return 'query kosong';
  if (sql.length > 20000) return 'query terlalu panjang';
  let inti;
  try { inti = tanpaLiteral(sql); } catch (e) { return e.message; }
  if (/--|\/\*|\*\//.test(inti)) return 'komentar SQL tidak diizinkan';
  const tanpaTitikKomaAkhir = inti.trim().replace(/;\s*$/, '');
  if (tanpaTitikKomaAkhir.includes(';')) return 'hanya satu pernyataan yang diizinkan';
  if (!/^\s*\(*\s*(SELECT|WITH)\b/i.test(tanpaTitikKomaAkhir)) return 'harus diawali SELECT atau WITH';
  for (const k of KATA_TERLARANG) {
    if (new RegExp(`\\b${k}\\b`, 'i').test(tanpaTitikKomaAkhir)) return `kata kunci "${k.replace('\\s+', ' ')}" tidak diizinkan (skrip ini hanya untuk membaca)`;
  }
  return null;
}

function samarkan(baris) {
  return baris.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) =>
    [k, KOLOM_RAHASIA.test(k) && v != null && v !== '' ? '•••(disamarkan)' : v])));
}

function jalankan(sql, lokal) {
  const out = execFileSync(process.execPath, [
    WRANGLER, 'd1', 'execute', DB, lokal ? '--local' : '--remote', '--json', '--command', sql,
  ], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 27, stdio: ['ignore', 'pipe', 'pipe'] });
  const m = out.match(/\[\s*\{\s*"results"/);
  if (!m) throw new Error(`keluaran wrangler tidak dikenali: ${out.slice(0, 300)}`);
  return JSON.parse(out.slice(m.index));
}

// Dijalankan langsung (bukan di-import oleh uji) → eksekusi.
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = new Set(args.filter(a => a.startsWith('--')));
  const sql = args.filter(a => !a.startsWith('--')).join(' ');
  const tolak = periksaQuery(sql);
  if (tolak) {
    console.error(`DITOLAK: ${tolak}`);
    process.exit(2);
  }
  if (flag.has('--cek')) { console.log('OK: query lolos pemeriksaan baca-saja'); process.exit(0); }
  let hasil;
  try {
    hasil = jalankan(sql, flag.has('--lokal'));
  } catch (err) {
    const pesan = String(err.stderr || err.message || err).split('\n').filter(Boolean).slice(-3).join(' | ');
    console.error(`GAGAL: ${pesan.slice(0, 500)}`);
    process.exit(1);
  }
  const q = hasil[0] ?? {};
  const baris = samarkan(q.results ?? []);
  if (flag.has('--json')) {
    console.log(JSON.stringify(baris, null, 2));
  } else if (baris.length === 0) {
    console.log('(0 baris)');
  } else {
    const kolom = Object.keys(baris[0]);
    console.log(kolom.join(' | '));
    for (const r of baris) console.log(kolom.map(k => (r[k] == null ? '∅' : String(r[k]))).join(' | '));
  }
  console.error(`— ${baris.length} baris · rows_read ${q.meta?.rows_read ?? '?'} · ${flag.has('--lokal') ? 'LOKAL' : 'PRODUKSI'}`);
}
