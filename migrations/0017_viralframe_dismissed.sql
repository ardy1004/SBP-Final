-- Migration 0017: Tombol "Reset" di Viral Frame — dismiss kosmetik, BUKAN hapus data.
-- Overlay hitam di card ViralFrame menandakan properti sudah pernah diproses (ada
-- naskah/video). dismissed_at membiarkan admin "menyembunyikan" overlay itu tanpa
-- menghapus riwayat naskah/video (yang sudah tersimpan permanen di viralframe_generations
-- / viralframe_videos untuk Content Library). Kalau properti diproses ulang setelah
-- dismiss, overlay otomatis muncul lagi (dismissed_at direset ke NULL oleh endpoint terkait).

ALTER TABLE properties ADD COLUMN viralframe_dismissed_at TEXT;
