-- Migration 0031: preset jam scheduler diseragamkan (1 jam per slot, bukan
-- 3 jam beda per grup platform). Rotasi +5 menit/hari (maks +120 menit,
-- siklus 24 hari) sekarang dihitung di kode (functions/_lib/schedulerProviders.js),
-- bukan disimpan di sini -- preset ini cuma jam DASAR sebelum drift.
--
-- Reset paksa (bukan migrasi data 1:1) karena filosofinya berubah total dari
-- bentuk lama {slot,fb_ig_threads,tiktok,youtube}.
UPDATE settings
SET value = '[{"slot":1,"time":"06:00"},{"slot":2,"time":"09:00"},{"slot":3,"time":"12:00"},{"slot":4,"time":"17:00"},{"slot":5,"time":"19:00"}]'
WHERE key = 'viralframe_schedule_preset';
