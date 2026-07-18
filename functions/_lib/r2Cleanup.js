// Kumpulkan & hapus semua objek R2 milik satu/lebih properti sebelum DELETE
// baris properties. Tanpa ini, CASCADE hanya menghapus baris D1 (property_images,
// viralframe_videos, agreements) sedangkan objek R2-nya (foto, video, tanda
// tangan, PDF perjanjian) tertinggal selamanya — kuncinya hilang bersama baris DB.

/** Semua kunci R2 yang terkait daftar property id. */
export async function collectPropertyR2Keys(db, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const ph = ids.map(() => '?').join(',');
  const keys = [];

  const push = (rows, ...cols) => {
    for (const row of rows ?? []) {
      for (const c of cols) if (row[c]) keys.push(row[c]);
    }
  };

  const [photos, videos, agreements] = await Promise.all([
    db.prepare(`SELECT url_webp FROM property_images WHERE property_id IN (${ph})`).bind(...ids).all(),
    db.prepare(`SELECT r2_key FROM viralframe_videos WHERE property_id IN (${ph})`).bind(...ids).all()
      .catch(() => ({ results: [] })), // tabel dibuat manual via d1 execute — bisa belum ada di env lokal
    db.prepare(`SELECT signature_image_url, pdf_url FROM agreements WHERE property_id IN (${ph})`).bind(...ids).all(),
  ]);

  push(photos.results, 'url_webp');
  push(videos.results, 'r2_key');
  push(agreements.results, 'signature_image_url', 'pdf_url');
  return keys;
}

/** Hapus kunci-kunci R2 secara batch (maks 1000 kunci per panggilan delete). */
export async function deleteR2Keys(media, keys) {
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    try { await media.delete(chunk); }
    catch (err) { console.error('[r2Cleanup] delete batch gagal:', err.message); }
  }
}
