// Backend penyimpanan video Konten Agent — satu sumber untuk "video ini
// disimpan di mana, URL publiknya apa, dan cara menghapusnya bagaimana".
//
// Sejak migrasi 0043 ada DUA backend yang hidup berdampingan:
//   'r2'         → bucket sbp-video (binding env.VIDEO), disajikan lewat
//                  R2_PUBLIC_BASE. Egress $0, tidak ada transformasi sama sekali.
//   'cloudinary' → baris lama sebelum migrasi. Dibiarkan apa adanya sampai cron
//                  purge menghabiskannya (~30 hari), TIDAK dipindahkan paksa.
//
// Alasan pindah (diukur ke Admin API 2026-08-20, akun agent utama): 28,69 dari
// 25 credits terpakai — 51% dari transformasi poster video (ditagih per DETIK
// durasi, bukan per file) dan 33% dari bandwidth unduhan Buffer/Zernio.

import { destroyByCloudName } from './cloudinary.js';

// Semua objek video hidup di bawah prefiks ini supaya bucket sbp-video gampang
// dibedakan isinya kalau suatu saat dipakai untuk hal lain.
const PREFIX = 'agent-videos';

// Key objek untuk satu upload baru. UUID, bukan nama file asli: nama dari PC
// admin bisa mengandung spasi/karakter non-ASCII yang menyulitkan URL, dan dua
// upload berbeda bisa bernama sama persis ("video.mp4") lalu saling menimpa.
export function kunciVideoBaru(propertyId, ekstensi = 'mp4') {
  const pid = Number.isInteger(propertyId) && propertyId > 0 ? propertyId : 'misc';
  const id = crypto.randomUUID();
  return {
    key: `${PREFIX}/${pid}/${id}.${ekstensi}`,
    posterKey: `${PREFIX}/${pid}/${id}.jpg`,
  };
}

// Poster selalu key video dengan ekstensi diganti .jpg — dipakai saat menghapus
// baris lama yang poster_url-nya belum tercatat terpisah.
export function posterKeyDari(videoKey) {
  if (typeof videoKey !== 'string' || !videoKey) return null;
  return videoKey.replace(/\.[^./]+$/, '') + '.jpg';
}

export function urlPublik(env, key) {
  const base = (env.R2_PUBLIC_BASE ?? '').replace(/\/+$/, '');
  if (!base || !key) return null;
  return `${base}/${key}`;
}

export function r2Siap(env) {
  return !!(env.VIDEO && env.R2_PUBLIC_BASE);
}

// Hapus aset milik satu baris viralframe_agent_videos, apa pun backend-nya.
// MELEMPAR kalau gagal — pemanggil (bulk/purge/[id]) sudah dirancang menahan
// penghapusan baris D1 saat ini gagal, supaya aset tidak jadi yatim tanpa jejak.
//
// ⚠️ Urutan pemeriksaan di sini PENTING. Jalur hapus lama membaca
// `if (!row.cloudinary_public_id) → tidak ada file, buang saja baris D1`.
// Baris R2 memang selalu punya cloudinary_public_id NULL, jadi kalau backend-nya
// tidak diperiksa LEBIH DULU, setiap penghapusan baris R2 akan menghapus catatan
// D1-nya dan meninggalkan objek di bucket selamanya — tanpa error apa pun.
export async function hapusAsetVideo(env, row) {
  if (row?.storage === 'r2') {
    if (!row.r2_key) return; // baris R2 tanpa key: tidak ada file untuk dihapus
    if (!env.VIDEO) throw new Error('Binding R2 VIDEO belum dikonfigurasi');

    await env.VIDEO.delete(row.r2_key);
    // Poster ikut dihapus. R2 delete() TIDAK error untuk key yang tidak ada,
    // jadi baris lama yang posternya belum sempat dibuat aman-aman saja.
    const pKey = posterKeyDari(row.r2_key);
    if (pKey) await env.VIDEO.delete(pKey);
    return;
  }

  if (!row?.cloudinary_public_id) return; // baris Cloudinary tanpa file
  await destroyByCloudName(env, row.cloudinary_name, row.cloudinary_public_id, row.resource_type);
}
