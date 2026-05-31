-- =============================================================================
-- SBP — Seed Data Lokasi DI Yogyakarta
-- Referensi: SBP_MASTER_SPEC.md section 4.9 + mockData.ts LOCATION_HIERARCHY
-- Hierarki: Provinsi (1) → Kabupaten/Kota (5) → Kecamatan → Kelurahan
--
-- IDEMPOTENCY: Semua INSERT menggunakan OR IGNORE agar aman dijalankan ulang.
-- Jika row dengan id yang sama sudah ada → baris di-skip, bukan error.
--
-- STATUS KELURAHAN:
--   ✅ = data lengkap (diambil dari mockData.ts + BPS DIY)
--   📌 = kecamatan ada, kelurahan perlu dilengkapi admin via dashboard
--
-- ID RANGES (tidak ada bentrok):
--   1        = Provinsi DI Yogyakarta
--   2–6      = Kabupaten/Kota (5 wilayah)
--   10–22    = Kecamatan Kota Yogyakarta (13 kecamatan)
--   30–46    = Kecamatan Sleman (17 kecamatan)
--   50–66    = Kecamatan Bantul (17 kecamatan)
--   70–86    = Kecamatan Gunung Kidul (17 kecamatan)
--   90–101   = Kecamatan Kulon Progo (12 kecamatan)
--   1001+    = Kelurahan/Desa (gap antar kelompok = ruang ekspansi)
-- =============================================================================

-- =============================================================================
-- LEVEL 1: PROVINSI (parent_id = NULL)
-- =============================================================================
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1, 'DI Yogyakarta', 'provinsi', NULL, 'di-yogyakarta');

-- =============================================================================
-- LEVEL 2: KABUPATEN / KOTA — parent_id = 1 (DI Yogyakarta)
-- =============================================================================
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(2, 'Kota Yogyakarta', 'kabupaten', 1, 'kota-yogyakarta'),
(3, 'Sleman',          'kabupaten', 1, 'sleman'),
(4, 'Bantul',          'kabupaten', 1, 'bantul'),
(5, 'Gunung Kidul',    'kabupaten', 1, 'gunung-kidul'),
(6, 'Kulon Progo',     'kabupaten', 1, 'kulon-progo');

-- =============================================================================
-- LEVEL 3: KECAMATAN
-- =============================================================================

-- Kota Yogyakarta (parent_id=2) — 13 kecamatan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(10, 'Danurejan',    'kecamatan', 2, 'danurejan'),
(11, 'Gedongtengen', 'kecamatan', 2, 'gedongtengen'),
(12, 'Gondomanan',   'kecamatan', 2, 'gondomanan'),
(13, 'Jetis',        'kecamatan', 2, 'jetis'),
(14, 'Kotagede',     'kecamatan', 2, 'kotagede'),
(15, 'Kraton',       'kecamatan', 2, 'kraton'),
(16, 'Mantrijeron',  'kecamatan', 2, 'mantrijeron'),
(17, 'Mergangsan',   'kecamatan', 2, 'mergangsan'),
(18, 'Ngampilan',    'kecamatan', 2, 'ngampilan'),
(19, 'Pakualaman',   'kecamatan', 2, 'pakualaman'),
(20, 'Tegalrejo',    'kecamatan', 2, 'tegalrejo'),
(21, 'Umbulharjo',   'kecamatan', 2, 'umbulharjo'),
(22, 'Wirobrajan',   'kecamatan', 2, 'wirobrajan');

-- Sleman (parent_id=3) — 17 kecamatan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(30, 'Berbah',      'kecamatan', 3, 'berbah'),
(31, 'Cangkringan', 'kecamatan', 3, 'cangkringan'),
(32, 'Depok',       'kecamatan', 3, 'depok'),
(33, 'Gamping',     'kecamatan', 3, 'gamping'),
(34, 'Godean',      'kecamatan', 3, 'godean'),
(35, 'Kalasan',     'kecamatan', 3, 'kalasan'),
(36, 'Minggir',     'kecamatan', 3, 'minggir'),
(37, 'Mlati',       'kecamatan', 3, 'mlati'),
(38, 'Moyudan',     'kecamatan', 3, 'moyudan'),
(39, 'Ngaglik',     'kecamatan', 3, 'ngaglik'),
(40, 'Ngemplak',    'kecamatan', 3, 'ngemplak'),
(41, 'Pakem',       'kecamatan', 3, 'pakem'),
(42, 'Prambanan',   'kecamatan', 3, 'prambanan'),
(43, 'Seyegan',     'kecamatan', 3, 'seyegan'),
(44, 'Sleman',      'kecamatan', 3, 'sleman-kec'),
(45, 'Tempel',      'kecamatan', 3, 'tempel'),
(46, 'Turi',        'kecamatan', 3, 'turi');

-- Bantul (parent_id=4) — 17 kecamatan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(50, 'Bambanglipuro', 'kecamatan', 4, 'bambanglipuro'),
(51, 'Banguntapan',   'kecamatan', 4, 'banguntapan'),
(52, 'Bantul',        'kecamatan', 4, 'bantul-kec'),
(53, 'Dlingo',        'kecamatan', 4, 'dlingo'),
(54, 'Imogiri',       'kecamatan', 4, 'imogiri'),
(55, 'Jetis',         'kecamatan', 4, 'jetis-bantul'),
(56, 'Kasihan',       'kecamatan', 4, 'kasihan'),
(57, 'Kretek',        'kecamatan', 4, 'kretek'),
(58, 'Pajangan',      'kecamatan', 4, 'pajangan'),
(59, 'Pandak',        'kecamatan', 4, 'pandak'),
(60, 'Piyungan',      'kecamatan', 4, 'piyungan'),
(61, 'Pleret',        'kecamatan', 4, 'pleret'),
(62, 'Pundong',       'kecamatan', 4, 'pundong'),
(63, 'Sanden',        'kecamatan', 4, 'sanden'),
(64, 'Sedayu',        'kecamatan', 4, 'sedayu'),
(65, 'Sewon',         'kecamatan', 4, 'sewon'),
(66, 'Srandakan',     'kecamatan', 4, 'srandakan');

-- Gunung Kidul (parent_id=5) — 17 kecamatan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(70, 'Gedangsari',  'kecamatan', 5, 'gedangsari'),
(71, 'Girisubo',    'kecamatan', 5, 'girisubo'),
(72, 'Karangmojo',  'kecamatan', 5, 'karangmojo'),
(73, 'Ngawen',      'kecamatan', 5, 'ngawen'),
(74, 'Nglipar',     'kecamatan', 5, 'nglipar'),
(75, 'Paliyan',     'kecamatan', 5, 'paliyan'),
(76, 'Panggang',    'kecamatan', 5, 'panggang'),
(77, 'Patuk',       'kecamatan', 5, 'patuk'),
(78, 'Playen',      'kecamatan', 5, 'playen'),
(79, 'Ponjong',     'kecamatan', 5, 'ponjong'),
(80, 'Purwosari',   'kecamatan', 5, 'purwosari'),
(81, 'Rongkop',     'kecamatan', 5, 'rongkop'),
(82, 'Semanu',      'kecamatan', 5, 'semanu'),
(83, 'Semin',       'kecamatan', 5, 'semin'),
(84, 'Tanjungsari', 'kecamatan', 5, 'tanjungsari'),
(85, 'Tepus',       'kecamatan', 5, 'tepus'),
(86, 'Wonosari',    'kecamatan', 5, 'wonosari');

-- Kulon Progo (parent_id=6) — 12 kecamatan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(90,  'Galur',      'kecamatan', 6, 'galur'),
(91,  'Girimulyo',  'kecamatan', 6, 'girimulyo'),
(92,  'Kalibawang', 'kecamatan', 6, 'kalibawang'),
(93,  'Kokap',      'kecamatan', 6, 'kokap'),
(94,  'Lendah',     'kecamatan', 6, 'lendah'),
(95,  'Nanggulan',  'kecamatan', 6, 'nanggulan'),
(96,  'Panjatan',   'kecamatan', 6, 'panjatan'),
(97,  'Pengasih',   'kecamatan', 6, 'pengasih'),
(98,  'Samigaluh',  'kecamatan', 6, 'samigaluh'),
(99,  'Sentolo',    'kecamatan', 6, 'sentolo'),
(100, 'Temon',      'kecamatan', 6, 'temon'),
(101, 'Wates',      'kecamatan', 6, 'wates');

-- =============================================================================
-- LEVEL 4: KELURAHAN / DESA ✅
-- Hanya untuk kecamatan yang sudah ada data properti di mockData.ts / prioritas.
-- Kelurahan dengan nama sama di kecamatan berbeda dibedakan via slug unik.
-- =============================================================================

-- Depok, Sleman (parent_id=32) ✅ — 3 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1001, 'Caturtunggal', 'kelurahan', 32, 'caturtunggal'),
(1002, 'Condongcatur', 'kelurahan', 32, 'condongcatur'),
(1003, 'Maguwoharjo',  'kelurahan', 32, 'maguwoharjo');

-- Mlati, Sleman (parent_id=37) ✅ — 4 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1010, 'Sinduadi',  'kelurahan', 37, 'sinduadi'),
(1011, 'Sumberadi', 'kelurahan', 37, 'sumberadi'),
(1012, 'Tlogoadi',  'kelurahan', 37, 'tlogoadi'),
(1013, 'Triharjo',  'kelurahan', 37, 'triharjo-mlati');

-- Ngaglik, Sleman (parent_id=39) ✅ — 6 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1020, 'Donoharjo',    'kelurahan', 39, 'donoharjo'),
(1021, 'Minomartani',  'kelurahan', 39, 'minomartani'),
(1022, 'Sariharjo',    'kelurahan', 39, 'sariharjo'),
(1023, 'Sardonoharjo', 'kelurahan', 39, 'sardonoharjo'),
(1024, 'Sinduharjo',   'kelurahan', 39, 'sinduharjo'),
(1025, 'Sukoharjo',    'kelurahan', 39, 'sukoharjo-ngaglik');

-- Pakem, Sleman (parent_id=41) ✅ — 4 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1030, 'Harjobinangun', 'kelurahan', 41, 'harjobinangun'),
(1031, 'Hargobinangun', 'kelurahan', 41, 'hargobinangun'),
(1032, 'Pakembinangun', 'kelurahan', 41, 'pakembinangun'),
(1033, 'Purwobinangun', 'kelurahan', 41, 'purwobinangun');

-- Gamping, Sleman (parent_id=33) ✅ — 5 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1040, 'Ambarketawang', 'kelurahan', 33, 'ambarketawang'),
(1041, 'Balecatur',     'kelurahan', 33, 'balecatur'),
(1042, 'Banyuraden',    'kelurahan', 33, 'banyuraden'),
(1043, 'Nogotirto',     'kelurahan', 33, 'nogotirto'),
(1044, 'Trihanggo',     'kelurahan', 33, 'trihanggo');

-- Godean, Sleman (parent_id=34) ✅ — 8 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1050, 'Sidoarum',  'kelurahan', 34, 'sidoarum'),
(1051, 'Sidoluhur', 'kelurahan', 34, 'sidoluhur'),
(1052, 'Sidoagung', 'kelurahan', 34, 'sidoagung'),
(1053, 'Sidomulyo', 'kelurahan', 34, 'sidomulyo-godean'),
(1054, 'Sidomoyo',  'kelurahan', 34, 'sidomoyo'),
(1055, 'Sidokarto', 'kelurahan', 34, 'sidokarto'),
(1056, 'Sidareja',  'kelurahan', 34, 'sidareja'),
(1057, 'Sidorejo',  'kelurahan', 34, 'sidorejo-godean');

-- Banguntapan, Bantul (parent_id=51) ✅ — 7 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1060, 'Baturetno',  'kelurahan', 51, 'baturetno'),
(1061, 'Jambidan',   'kelurahan', 51, 'jambidan'),
(1062, 'Jagalan',    'kelurahan', 51, 'jagalan'),
(1063, 'Potorono',   'kelurahan', 51, 'potorono'),
(1064, 'Tamanan',    'kelurahan', 51, 'tamanan'),
(1065, 'Tegaltirto', 'kelurahan', 51, 'tegaltirto'),
(1066, 'Wirokerten', 'kelurahan', 51, 'wirokerten');

-- Sewon, Bantul (parent_id=65) ✅ — 4 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1070, 'Bangunharjo',   'kelurahan', 65, 'bangunharjo'),
(1071, 'Panggungharjo', 'kelurahan', 65, 'panggungharjo'),
(1072, 'Pendowoharjo',  'kelurahan', 65, 'pendowoharjo-sewon'),
(1073, 'Timbulharjo',   'kelurahan', 65, 'timbulharjo');

-- Kasihan, Bantul (parent_id=56) ✅ — 4 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1080, 'Bangunjiwo',   'kelurahan', 56, 'bangunjiwo'),
(1081, 'Ngestiharjo',  'kelurahan', 56, 'ngestiharjo-kasihan'),
(1082, 'Pendowoharjo', 'kelurahan', 56, 'pendowoharjo-kasihan'),
(1083, 'Tirtonirmolo', 'kelurahan', 56, 'tirtonirmolo');

-- Sanden, Bantul (parent_id=63) ✅ — 4 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1090, 'Gadingharjo', 'kelurahan', 63, 'gadingharjo'),
(1091, 'Gadingsari',  'kelurahan', 63, 'gadingsari'),
(1092, 'Murtigading', 'kelurahan', 63, 'murtigading'),
(1093, 'Srigading',   'kelurahan', 63, 'srigading');

-- Kretek, Bantul (parent_id=57) ✅ — 5 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1100, 'Donotirto',   'kelurahan', 57, 'donotirto'),
(1101, 'Parangtritis', 'kelurahan', 57, 'parangtritis'),
(1102, 'Tirtohargo',  'kelurahan', 57, 'tirtohargo'),
(1103, 'Tirtomulyo',  'kelurahan', 57, 'tirtomulyo'),
(1104, 'Tirtosari',   'kelurahan', 57, 'tirtosari');

-- Umbulharjo, Kota Yogyakarta (parent_id=21) ✅ — 7 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1110, 'Giwangan',   'kelurahan', 21, 'giwangan'),
(1111, 'Muja-muju',  'kelurahan', 21, 'muja-muju'),
(1112, 'Pandeyan',   'kelurahan', 21, 'pandeyan'),
(1113, 'Semaki',     'kelurahan', 21, 'semaki'),
(1114, 'Sorosutan',  'kelurahan', 21, 'sorosutan'),
(1115, 'Tahunan',    'kelurahan', 21, 'tahunan'),
(1116, 'Warungboto', 'kelurahan', 21, 'warungboto');

-- Wirobrajan, Kota Yogyakarta (parent_id=22) ✅ — 3 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1120, 'Kricak',        'kelurahan', 22, 'kricak'),
(1121, 'Patangpuluhan', 'kelurahan', 22, 'patangpuluhan'),
(1122, 'Tegalrejo',     'kelurahan', 22, 'tegalrejo-wirobrajan');

-- Gondomanan, Kota Yogyakarta (parent_id=12) ✅ — 2 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1130, 'Ngupasan',      'kelurahan', 12, 'ngupasan'),
(1131, 'Prawirodirjan', 'kelurahan', 12, 'prawirodirjan');

-- Danurejan, Kota Yogyakarta (parent_id=10) ✅ — 3 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1140, 'Bausasran',     'kelurahan', 10, 'bausasran'),
(1141, 'Danurejan',     'kelurahan', 10, 'danurejan-kel'),
(1142, 'Tegalpanggung', 'kelurahan', 10, 'tegalpanggung');

-- Gedongtengen, Kota Yogyakarta (parent_id=11) ✅ — 2 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1150, 'Pringgokusuman', 'kelurahan', 11, 'pringgokusuman'),
(1151, 'Sosromenduran',  'kelurahan', 11, 'sosromenduran');

-- Jetis, Kota Yogyakarta (parent_id=13) ✅ — 3 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1160, 'Bumijo',           'kelurahan', 13, 'bumijo'),
(1161, 'Cokrodiningratan', 'kelurahan', 13, 'cokrodiningratan'),
(1162, 'Gowongan',         'kelurahan', 13, 'gowongan');

-- Kraton, Kota Yogyakarta (parent_id=15) ✅ — 3 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1170, 'Kadipaten',  'kelurahan', 15, 'kadipaten'),
(1171, 'Panembahan', 'kelurahan', 15, 'panembahan'),
(1172, 'Patehan',    'kelurahan', 15, 'patehan');

-- Mantrijeron, Kota Yogyakarta (parent_id=16) ✅ — 3 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1180, 'Gedongkiwo',       'kelurahan', 16, 'gedongkiwo'),
(1181, 'Mantrijeron',      'kelurahan', 16, 'mantrijeron-kel'),
(1182, 'Suryodiningratan', 'kelurahan', 16, 'suryodiningratan');

-- Mergangsan, Kota Yogyakarta (parent_id=17) ✅ — 3 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1190, 'Brontokusuman', 'kelurahan', 17, 'brontokusuman'),
(1191, 'Keparakan',     'kelurahan', 17, 'keparakan'),
(1192, 'Wirogunan',     'kelurahan', 17, 'wirogunan');

-- Wonosari, Gunung Kidul (parent_id=86) ✅ — 10 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1200, 'Argosari',     'kelurahan', 86, 'argosari'),
(1201, 'Baleharjo',    'kelurahan', 86, 'baleharjo'),
(1202, 'Karangtengah', 'kelurahan', 86, 'karangtengah'),
(1203, 'Kepek',        'kelurahan', 86, 'kepek'),
(1204, 'Mulo',         'kelurahan', 86, 'mulo'),
(1205, 'Piyaman',      'kelurahan', 86, 'piyaman'),
(1206, 'Selang',       'kelurahan', 86, 'selang'),
(1207, 'Siraman',      'kelurahan', 86, 'siraman'),
(1208, 'Wareng',       'kelurahan', 86, 'wareng'),
(1209, 'Wonosari',     'kelurahan', 86, 'wonosari-kel');

-- Playen, Gunung Kidul (parent_id=78) ✅ — 9 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1210, 'Bleberan',  'kelurahan', 78, 'bleberan'),
(1211, 'Bunder',    'kelurahan', 78, 'bunder'),
(1212, 'Gading',    'kelurahan', 78, 'gading-playen'),
(1213, 'Ngleri',    'kelurahan', 78, 'ngleri'),
(1214, 'Playen',    'kelurahan', 78, 'playen-kel'),
(1215, 'Plembutan', 'kelurahan', 78, 'plembutan'),
(1216, 'Riharjo',   'kelurahan', 78, 'riharjo'),
(1217, 'Sawahan',   'kelurahan', 78, 'sawahan-playen'),
(1218, 'Ngunut',    'kelurahan', 78, 'ngunut');

-- Wates, Kulon Progo (parent_id=101) ✅ — 7 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1220, 'Bendungan',  'kelurahan', 101, 'bendungan'),
(1221, 'Giripeni',   'kelurahan', 101, 'giripeni'),
(1222, 'Kulwaru',    'kelurahan', 101, 'kulwaru'),
(1223, 'Ngestiharjo','kelurahan', 101, 'ngestiharjo-wates'),
(1224, 'Sogan',      'kelurahan', 101, 'sogan'),
(1225, 'Triharjo',   'kelurahan', 101, 'triharjo-wates'),
(1226, 'Wates',      'kelurahan', 101, 'wates-kel');

-- Sentolo, Kulon Progo (parent_id=99) ✅ — 5 kelurahan
INSERT OR IGNORE INTO locations (id, nama, tipe, parent_id, slug) VALUES
(1230, 'Demangrejo', 'kelurahan', 99, 'demangrejo'),
(1231, 'Kaliagung',  'kelurahan', 99, 'kaliagung'),
(1232, 'Salamrejo',  'kelurahan', 99, 'salamrejo'),
(1233, 'Sentolo',    'kelurahan', 99, 'sentolo-kel'),
(1234, 'Sukoreno',   'kelurahan', 99, 'sukoreno');

-- =============================================================================
-- 📌 TODO: Kelurahan berikut perlu dilengkapi via Admin Dashboard
-- Kota Yk : Ngampilan (18), Pakualaman (19), Tegalrejo (20), Kotagede (14)
-- Sleman  : Berbah (30), Cangkringan (31), Kalasan (35), Minggir (36),
--           Moyudan (38), Ngemplak (40), Prambanan (42), Seyegan (43),
--           Sleman-kec (44), Tempel (45), Turi (46)
-- Bantul  : Bambanglipuro (50), Bantul-kec (52), Dlingo (53), Imogiri (54),
--           Jetis-bantul (55), Pajangan (58), Pandak (59), Piyungan (60),
--           Pleret (61), Pundong (62), Sedayu (64), Srandakan (66)
-- GunKid  : semua kecamatan kecuali Wonosari + Playen
-- KulPro  : semua kecamatan kecuali Wates + Sentolo
-- =============================================================================
