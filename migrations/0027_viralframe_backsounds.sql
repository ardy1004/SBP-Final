-- Migration 0027: bank backsound (musik latar) ViralFrame
--
-- KENAPA ADA
-- Video hasil generate ViralFrame di-paste ke Google Flow/Veo 3.1 secara eksternal
-- sering keluar tanpa musik latar terdengar (Veo audio-native memprioritaskan
-- dialog, sering mengabaikan cue musik latar berupa teks). Backsound Studio
-- menambahkan musik latar SETELAH video jadi, langsung di web (ffmpeg.wasm
-- client-side), tanpa perlu CapCut. Lihat AdminViralFrameWorkspacePage.tsx
-- (BacksoundStudio) dan functions/api/admin/viralframe/backsounds/.
--
-- Global (TANPA property_id), sama seperti viralframe_characters (migrasi 0012)
-- — bank musik dipakai lintas listing, bukan per-properti seperti viralframe_videos.

CREATE TABLE IF NOT EXISTS viralframe_backsounds (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    label        TEXT    NOT NULL,
    r2_key       TEXT    NOT NULL,      -- viralframe-backsound/uuid.mp3
    duration_sec INTEGER,
    size_bytes   INTEGER,
    created_at   TEXT    DEFAULT (datetime('now'))
);
