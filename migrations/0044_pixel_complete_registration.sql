-- 0044: daftarkan CompleteRegistration pada baris pixel_configs yang SUDAH ADA.
--
-- KENAPA MIGRASI INI WAJIB, bukan sekadar menambah nama di kode:
-- setiap baris pixel_configs menyimpan SALINAN daftar event-nya sendiri di
-- kolom `events_enabled`, dan dua tempat memeriksanya sebelum mengirim apa pun:
--   · trackEvent()  -> px.events_enabled.includes(eventName)   (browser)
--   · filter CAPI   -> JSON.parse(events_enabled).includes(…)  (server)
-- Tanpa baris ini, seluruh jalur Titip Jual -> Meta lulus semua gate tapi
-- mengirim NOL event, tanpa satu pun error. Daftar kanoniknya di
-- functions/_lib/metaEvents.js.
--
-- Idempoten lewat penjaga NOT LIKE — aman dijalankan ulang, dan aman untuk
-- baris yang sudah terlanjur dicentang manual lewat Admin -> Pengaturan.
-- json_valid() menjaga baris yang isinya bukan JSON (mis. NULL) tidak disentuh.
--
-- ⚠️ pixel_configs TIDAK punya kolom updated_at (id, label, pixel_id,
-- is_active, events_enabled, capi_access_token, created_at) — jangan tambahkan.
UPDATE pixel_configs
   SET events_enabled = json_insert(events_enabled, '$[#]', 'CompleteRegistration')
 WHERE json_valid(events_enabled)
   AND events_enabled NOT LIKE '%CompleteRegistration%';
