-- Migration 0041: auto-jadwal per agent + mesin jam berbasis jendela.
--
-- Menggantikan preset 5 slot tetap (jam sama tiap hari untuk semua agent, dan
-- kelima platform terbit pada DETIK yang sama) dengan: 3 jendela primetime,
-- menit acak-ber-seed di dalam jendela, dan geseran per platform. Terukur
-- 2026-08-11: 25 baris jadwal per hari hanya menghasilkan 5 jam berbeda —
-- tanda tangan mesin paling kentara di sistem ini.

-- ── Kolom auto-jadwal per agent ──────────────────────────────────────────────
ALTER TABLE viralframe_agent_accounts ADD COLUMN jam_auto TEXT;
ALTER TABLE viralframe_agent_accounts ADD COLUMN auto_aktif INTEGER NOT NULL DEFAULT 0;
-- Tanggal post pertama lewat AKUN SENDIRI. Diisi otomatis saat itu terjadi.
ALTER TABLE viralframe_agent_accounts ADD COLUMN mulai_aktif TEXT;
ALTER TABLE viralframe_agent_accounts ADD COLUMN auto_terakhir TEXT;
ALTER TABLE viralframe_agent_accounts ADD COLUMN auto_hasil TEXT;

-- Jam submit ke Buffer/Zernio (WIB), berjenjang 30 menit supaya tidak menumpuk.
-- Ini jam MENGIRIM KE SCHEDULER, bukan jam tayang di medsos — tayangnya
-- ditentukan jendela primetime di bawah.
UPDATE viralframe_agent_accounts SET jam_auto = '01:00' WHERE character_id = (SELECT id FROM viralframe_characters WHERE nama = 'Monica Vera');
UPDATE viralframe_agent_accounts SET jam_auto = '01:30' WHERE character_id = (SELECT id FROM viralframe_characters WHERE nama = 'vina');
UPDATE viralframe_agent_accounts SET jam_auto = '02:00' WHERE character_id = (SELECT id FROM viralframe_characters WHERE nama = 'lisa');
UPDATE viralframe_agent_accounts SET jam_auto = '02:30' WHERE character_id = (SELECT id FROM viralframe_characters WHERE nama = 'cindy');
UPDATE viralframe_agent_accounts SET jam_auto = '03:00' WHERE character_id = (SELECT id FROM viralframe_characters WHERE nama = 'ayu');
UPDATE viralframe_agent_accounts SET jam_auto = '03:30' WHERE character_id = (SELECT id FROM viralframe_characters WHERE nama = 'angle');
UPDATE viralframe_agent_accounts SET jam_auto = '04:00' WHERE character_id = (SELECT id FROM viralframe_characters WHERE nama = 'hana');

-- ── Akun yang BENAR-BENAR menerbitkan, per baris jadwal ──────────────────────
-- WAJIB untuk menghitung kuota harian dan "hari nyata" per akun. Sengaja
-- dinamai akun_id, BUKAN character_id: yang dihitung adalah akun sosmed yang
-- dipakai, bukan agent yang membuat videonya. Di mode Terpusat keduanya berbeda,
-- dan menyamakannya adalah cara termudah memberi agent baru jam terbang palsu.
ALTER TABLE viralframe_scheduled_posts ADD COLUMN akun_id INTEGER;

-- Backfill: SELURUH riwayat terbit lewat akun agent utama — sebelum migrasi 0037
-- hanya ada satu pasang key Buffer/Zernio (miliknya), dan sesudahnya mode masih
-- 'terpusat'. Jadi menautkannya ke agent pembuat video akan SALAH: kelima agent
-- akan terlihat punya puluhan hari jam terbang di akun yang belum pernah mereka
-- pakai, lalu ramp-up 1x/hari mereka terlewat begitu saja.
UPDATE viralframe_scheduled_posts
   SET akun_id = (SELECT id FROM viralframe_characters WHERE nama = 'Monica Vera')
 WHERE akun_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_vfsp_akun_tgl ON viralframe_scheduled_posts(akun_id, scheduled_at);

-- ── Setelan global ───────────────────────────────────────────────────────────
-- Saklar induk MATI saat rilis: sistem dibangun dulu, user uji dry-run, baru nyala.
INSERT OR REPLACE INTO settings (key, value) VALUES ('viralframe_auto_aktif', '0');

-- Tiga jendela primetime WIB. Bisa diedit dari Admin → Pengaturan.
INSERT OR REPLACE INTO settings (key, value) VALUES ('viralframe_jendela',
  '[{"nama":"Pagi","mulai":"06:30","akhir":"08:30"},{"nama":"Siang","mulai":"11:30","akhir":"13:30"},{"nama":"Malam","mulai":"19:00","akhir":"21:30"}]');

-- Preset 5 slot lama dihapus, bukan ditinggal: kalau dibiarkan ia jadi layar
-- yang bisa diedit tapi tidak dibaca siapa pun.
DELETE FROM settings WHERE key = 'viralframe_schedule_preset';
