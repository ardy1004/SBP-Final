// Pembuat varian ukuran foto properti di browser ADMIN (2026-11-25).
//
// Tiap foto properti disimpan di R2 dalam 2 lebar tetap (640 & 1280) supaya
// halaman tidak lagi memakai Cloudflare Image Transformations per permintaan
// (kuota 5.000 unik/bulan habis 22 Nov 2026). Lihat functions/_lib/ukuranFoto.js.
//
// Sengaja HANYA dipakai di admin (PropertyPhotosCard), tidak di form Titip Jual:
// di HP murah kanvas yang menumpuk membuat WebView crash dan seluruh foto
// hilang, dan Safari/iPhone tidak bisa membuat WebP. Foto Titip Jual dilengkapi
// variannya saat admin membuka properti (lihat PropertyPhotosCard).

import type { LebarFoto } from '../../lib/img';

export const UKURAN_FOTO: LebarFoto[] = [640, 1280];
// Sama dengan pola portfolio (foto 1280 @0.82, thumb @0.78).
const MUTU: Record<LebarFoto, number> = { 640: 0.78, 1280: 0.82 };

type Sumber = ImageBitmap | HTMLImageElement;

async function muat(blob: Blob): Promise<Sumber> {
  try {
    return await createImageBitmap(blob);
  } catch {
    // Cadangan untuk browser yang createImageBitmap-nya menolak format tertentu.
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function kodekan(c: HTMLCanvasElement, mutu: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob(blob => {
      // Browser tanpa encoder WebP diam-diam memberi PNG (5–10× lebih besar) —
      // ulangi sebagai JPEG. Server hanya menerima WebP/JPEG.
      if (blob && blob.type !== 'image/webp') {
        c.toBlob(j => (j ? resolve(j) : reject(new Error('Gagal membuat JPEG'))), 'image/jpeg', 0.85);
        return;
      }
      if (blob) resolve(blob); else reject(new Error('Gagal membuat WebP'));
    }, 'image/webp', mutu);
  });
}

function keDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('Gagal membaca hasil'));
    r.readAsDataURL(blob);
  });
}

/**
 * Buat varian dari satu foto. Lebar dibatasi, TIDAK pernah membesarkan: foto
 * yang lebih kecil dari target tetap dibuatkan varian di lebar aslinya, supaya
 * setiap foto selalu punya kedua kunci (deterministik, tanpa kolom D1).
 */
export async function buatUkuranFoto(sumber: Blob, lebar: LebarFoto[] = UKURAN_FOTO): Promise<Partial<Record<LebarFoto, string>>> {
  const gambar = await muat(sumber);
  const W = gambar instanceof HTMLImageElement ? gambar.naturalWidth : gambar.width;
  const H = gambar instanceof HTMLImageElement ? gambar.naturalHeight : gambar.height;
  if (!W || !H) throw new Error('Ukuran gambar tidak terbaca');
  const hasil: Partial<Record<LebarFoto, string>> = {};
  try {
    for (const w of lebar) {
      const tw = Math.min(w, W);
      const th = Math.max(1, Math.round((H * tw) / W));
      const c = document.createElement('canvas');
      c.width = tw;
      c.height = th;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('Canvas tidak tersedia');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(gambar, 0, 0, tw, th);
      const blob = await kodekan(c, MUTU[w]);
      // Lepas memori kanvas segera (foto 4608 px pernah ada di produksi).
      c.width = 0; c.height = 0;
      hasil[w] = await keDataUrl(blob);
    }
  } finally {
    if (!(gambar instanceof HTMLImageElement)) gambar.close();
  }
  return hasil;
}
