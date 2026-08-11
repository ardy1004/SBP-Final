-- Migration 0038: channel sosmed agent jadi PLATFORM-CENTRIC.
--
-- Migrasi 0037 menyimpan channel dalam kolom bernama provider+platform
-- (buffer_channel_id_threads, zernio_account_id_instagram, dst). Bentuk itu
-- MENGUNCI provider mana yang melayani platform mana — padahal itu fakta per
-- AKUN, bukan konstanta global. Terbukti saat menarik daftar akun asli
-- (2026-08-11):
--
--   Monica Vera        : Buffer = YouTube, TikTok, Threads   | Zernio = FB, Instagram
--   Hana/Angle/Ayu/... : Buffer = YouTube, TikTok, Instagram | Zernio = FB, Threads
--
-- Instagram & Threads bertukar provider. Dengan kolom lama, Instagram dan
-- Threads kelima agent itu tidak akan pernah punya tempat untuk disimpan, dan
-- fan-out-nya gagal dengan "channel ID belum diatur" — senyap, per platform.
--
-- channels_json: { "<platform>": { "provider": "buffer"|"zernio", "id": "..." } }
-- Tabelnya masih 0 baris saat migrasi ini dibuat, jadi tidak ada data yang perlu
-- dipindahkan — kolom lama langsung dibuang supaya tidak ada dua sumber kebenaran.

ALTER TABLE viralframe_agent_accounts ADD COLUMN channels_json TEXT;

ALTER TABLE viralframe_agent_accounts DROP COLUMN buffer_channel_id_youtube;
ALTER TABLE viralframe_agent_accounts DROP COLUMN buffer_channel_id_tiktok;
ALTER TABLE viralframe_agent_accounts DROP COLUMN buffer_channel_id_threads;
ALTER TABLE viralframe_agent_accounts DROP COLUMN zernio_account_id_facebook;
ALTER TABLE viralframe_agent_accounts DROP COLUMN zernio_account_id_instagram;
