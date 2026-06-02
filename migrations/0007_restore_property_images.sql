-- Migration 0007: Restore property_images data lost during 0006 table recreation
-- The ON DELETE CASCADE in property_images triggered when properties was dropped in 0006.
-- Restoring: 3 seeded rows + R2-uploaded photos from titip-jual submissions.
-- R2 objects still exist in local storage; only the DB rows need to be restored.

-- Seed photos (property_id 1, 2, 3)
INSERT OR IGNORE INTO property_images (id, property_id, url_webp, alt_text, urutan, is_cover) VALUES
(1, 1, 'https://images.unsplash.com/photo-1675657144518-025804f1812c?w=800&q=80',
 'Rumah minimalis 2 lantai Depok Sleman Jogja', 0, 1),
(2, 2, 'https://images.unsplash.com/photo-1735461932749-e602a9f6fc82?w=800&q=80',
 'Kost eksklusif putri Mlati Sleman Jogja', 0, 1),
(3, 3, 'https://images.unsplash.com/photo-1613553507747-5f8d62ad5904?w=800&q=80',
 'Tanah kavling Banguntapan Bantul Jogja', 0, 1);

-- R2-uploaded photos from titip-jual submissions (property_id 6–10)
INSERT OR IGNORE INTO property_images (id, property_id, url_webp, alt_text, urutan, is_cover) VALUES
(4,  6,  'property-photos/ea90d412-3ce2-4f8e-9cc2-b99564d3ce04.png', 'Rumah Depok', 0, 1),
(5,  6,  'property-photos/cf91d9a7-d23e-47cc-ae3d-1695dc6d7e52.png', 'Rumah Depok', 1, 0),
(6,  7,  'property-photos/65dcea32-3d3d-49c0-b6e9-bcefb98e2fd0.png', 'Rumah Danurejan', 0, 1),
(7,  8,  'property-photos/cde45625-5465-4138-9f2e-0ac05294dc9b.png', 'Kost Danurejan', 0, 1),
(8,  9,  'property-photos/0909c528-4436-4ec4-934e-364a8fe0049e.png', 'Rumah Caturtunggal', 0, 1),
(9,  10, 'property-photos/cb8a2452-20bd-4f5d-be18-7d8a9f88838b.png', 'Rumah Sinduadi', 0, 1);
