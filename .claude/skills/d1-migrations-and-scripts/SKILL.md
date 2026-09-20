---
name: d1-migrations-and-scripts
description: D1 migration workflow history (the 2026-07-25 ledger-drift incident and its reconciliation) plus 4 concrete pitfalls when writing a Node script that shells out to `wrangler d1` (--file vs --command, ENAMETOOLONG, execFileSync on Windows, JSON output parsing). Load when creating a new migration file or writing/reviewing a script that calls `wrangler d1`.
---

Moved from CLAUDE.md (check 4, /doctor). General D1 gotchas that apply to ANY query (not just migrations) — `DATE('now','localtime')` being UTC, the 100-bound-parameter limit, and the `--branch=master` production-exposure warning — stay in root CLAUDE.md since they're not migration-specific.

## Ledger migrasi D1 pernah drift dan sudah direkonsiliasi (2026-07-25)

Migrasi 0015–0023 dibuat lewat `d1 execute --remote` sehingga objeknya ada tapi tidak tercatat di `d1_migrations`; `migrations apply --remote` berikutnya akan menyeretnya dan GAGAL (0017/0019/0021/0023 = `ALTER TABLE ADD COLUMN` telanjang → "duplicate column name"), bahkan berpotensi menghapus data (0022 = RENAME→CREATE→DROP). Sudah diperbaiki via `scripts/reconcile_d1_migrations_0015_0023.sql`; `migrations list --remote` sekarang bersih.

- **Aturannya sekarang**: bikin tabel/kolom baru **lewat migrasi**, lalu `wrangler d1 migrations apply sbp-db --remote`. Kalau terpaksa pakai `d1 execute --remote`, WAJIB langsung catat namanya ke `d1_migrations` di transaksi yang sama. Cek `wrangler d1 migrations list sbp-db --remote` harus selalu "No migrations to apply" sebelum menambah migrasi baru.
- Selalu `wrangler d1 export sbp-db --remote --output=...` sebelum operasi tulis apa pun ke D1 produksi.

## Menulis skrip Node yang memanggil `wrangler d1` — 4 jebakan, semuanya sudah memakan waktu

1. **`--file` TIDAK mengembalikan baris data**, hanya RINGKASAN (`Rows read`). Untuk SELECT **wajib `--command`**. Memakai `--file` untuk baca membuat skrip melaporkan **1 baris dari 533** dan seluruh statistik dry-run tampak hijau di atas data sampah.
2. **`--command` kena `ENAMETOOLONG`** untuk UPDATE besar (batas argumen Windows ~32 KB). Jadi aturannya: **baca lewat `--command`, tulis lewat `--file`.**
3. Memanggil `npx`/`npx.cmd` via `execFileSync` di Windows/Node 24: tanpa shell → `EINVAL`, dengan `shell:true` → argumen dipecah di setiap spasi sehingga SQL rusak. Jalan bersih: panggil `node_modules/wrangler/bin/wrangler.js` langsung dengan `process.execPath`, tanpa shell.
4. `out.indexOf('[')` untuk memotong JSON keluaran **salah** — banner wrangler memuat `[` lebih dulu. Pakai `out.match(/\[\s*\{\s*"results"/)`.

Contoh yang sudah benar: `scripts/regen-meta-title.mjs`, `scripts/perbaiki-karakter-rusak.mjs` (keduanya **DRY-RUN default**, butuh `--tulis` eksplisit).
