-- Migration 0037: Storage & scheduler PER AGENT.
--
-- Sebelum ini semua agent (viralframe_characters) berbagi SATU akun Cloudinary
-- (dari Cloudflare env secret) dan SATU pasang key Buffer/Zernio (tabel
-- settings). Kredensial yang terpasang itu sebenarnya milik agent utama
-- (Monica Vera, cloud 'dhb8b7nrd') — diverifikasi 2026-08-11: 147 video yang
-- ada semuanya di cloud tersebut. Sekarang tiap agent bisa punya akunnya
-- sendiri; yang belum diisi tetap jatuh ke kredensial global lama (resolver di
-- functions/_lib/agentAccounts.js), jadi tidak ada yang mati saat migrasi.
--
-- spesialis = JSON array jenis_properti (mis. '["homestay","villa"]').
--   NULL / '[]' berarti bebas semua jenis (Monica Vera).
--   Dipakai UI untuk menyarankan agent yang cocok saat upload — MENYARANKAN,
--   tidak memblokir (keputusan user 2026-08-11).

CREATE TABLE IF NOT EXISTS viralframe_agent_accounts (
    character_id                INTEGER PRIMARY KEY REFERENCES viralframe_characters(id) ON DELETE CASCADE,
    gmail                       TEXT,
    spesialis                   TEXT,
    -- Storage (Cloudinary) — api_secret hanya dipakai server, tidak pernah ke browser
    cloudinary_name             TEXT,
    cloudinary_api_key          TEXT,
    cloudinary_api_secret       TEXT,
    -- Scheduler
    buffer_api_key              TEXT,
    zernio_api_key              TEXT,
    buffer_channel_id_youtube   TEXT,
    buffer_channel_id_tiktok    TEXT,
    buffer_channel_id_threads   TEXT,
    zernio_account_id_facebook  TEXT,
    zernio_account_id_instagram TEXT,
    updated_at                  TEXT DEFAULT (datetime('now'))
);

-- Cloud tempat aset BENAR-BENAR tersimpan, dicatat per baris. Tanpa ini,
-- begitu satu agent pindah akun, destroy/purge aset lamanya akan menembak
-- cloud yang salah dan GAGAL SENYAP (destroyCloudinaryAsset cuma console.error)
-- — file lama jadi yatim permanen sambil terus menagih biaya storage.
ALTER TABLE viralframe_agent_videos ADD COLUMN cloudinary_name TEXT;
ALTER TABLE viralframe_badge_assets ADD COLUMN cloudinary_name TEXT;

-- Backfill dari URL yang sudah tersimpan, bukan dari tebakan: cloud name adalah
-- segmen pertama setelah 'https://res.cloudinary.com/' (27 karakter, jadi mulai
-- posisi 28) sampai '/' berikutnya.
UPDATE viralframe_agent_videos
   SET cloudinary_name = substr(cloudinary_url, 28, instr(substr(cloudinary_url, 28), '/') - 1)
 WHERE cloudinary_name IS NULL
   AND cloudinary_url LIKE 'https://res.cloudinary.com/%/%';

UPDATE viralframe_badge_assets
   SET cloudinary_name = substr(cloudinary_url, 28, instr(substr(cloudinary_url, 28), '/') - 1)
 WHERE cloudinary_name IS NULL
   AND cloudinary_url LIKE 'https://res.cloudinary.com/%/%';

CREATE INDEX IF NOT EXISTS idx_vfav_cloud ON viralframe_agent_videos(cloudinary_name);
