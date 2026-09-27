-- Jejak siapa membuka / mengubah nomor identitas (NIK/SIM) terdekripsi.
--
-- Kebijakan Privasi pasal 4 menjanjikan "akses data terbatas pada personel
-- berwenang dengan log akses tercatat", tapi sampai 2026-09-27 tidak ada log apa
-- pun — dan selama ±2 bulan tiket publik bahkan diterima sebagai sesi admin
-- (lihat perbaikan JWT scope, f975067), sehingga siapa yang pernah membaca NIK
-- tidak bisa diketahui sama sekali. Tabel ini membuat akses berikutnya terlacak.
--
-- Ditulis oleh functions/api/admin/agreements/[id]/index.js:
--   aksi 'lihat' — GET detail yang berhasil mendekripsi nomor identitas
--   aksi 'ubah'  — PATCH yang mengganti nomor identitas
-- Tanpa FK ke admins/agreements: log harus bertahan walau barisnya dihapus.
CREATE TABLE IF NOT EXISTS log_akses_identitas (
    id           INTEGER  PRIMARY KEY AUTOINCREMENT,
    admin_id     INTEGER  NOT NULL,
    agreement_id INTEGER  NOT NULL,
    aksi         TEXT     NOT NULL CHECK (aksi IN ('lihat', 'ubah')),
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_log_akses_identitas_agreement ON log_akses_identitas(agreement_id, created_at);
