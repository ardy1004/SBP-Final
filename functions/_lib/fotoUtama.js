// Aturan tunggal foto utama: untuk setiap properti, foto dengan `urutan` terendah
// adalah SATU-SATUNYA yang `is_cover = 1` ("posisi 1 = foto utama").
//
// KENAPA ADA: situs publik membaca foto utama dengan DUA pola berbeda — kartu
// listing/beranda/pencarian/chatbot `ORDER BY is_cover DESC, urutan ASC`, sedangkan
// galeri detail + og:image (kartu share WhatsApp) `ORDER BY urutan ASC`. Keduanya
// hanya sepakat selama aturan ini dijaga. Sebelum 2026-09-26 tidak dijaga: 20
// properti menampilkan foto utama berbeda antara kartu listing dan halaman detail,
// dan 507 tidak punya cover sama sekali (upload admin tak pernah memberinya).
//
// Setiap penulis property_images WAJIB menjalankan ini setelah menulis — jangan
// menghitung is_cover sendiri. Dikembalikan sebagai prepared statement supaya
// bisa ikut env.DB.batch() secara atomik.
export function stmtNormalisasiCover(db, propertyId) {
  return db.prepare(`
    UPDATE property_images
       SET is_cover = CASE WHEN id = (
             SELECT id FROM property_images WHERE property_id = ?
              ORDER BY urutan ASC, id ASC LIMIT 1
           ) THEN 1 ELSE 0 END
     WHERE property_id = ?
  `).bind(propertyId, propertyId);
}
