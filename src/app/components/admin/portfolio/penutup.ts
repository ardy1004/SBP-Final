// Penutup bagian sensitif foto portofolio — "BLUR AMAN" berbentuk oval (2026-11-22).
//
// ⚠️ JANGAN diganti menjadi blur/piksel dari ISI ASLI. Teks atau angka yang
// di-blur atau dipiksel biasa bisa ditebak ulang (Depix, Unredacter), dan NIK
// paling rawan karena hanya berisi angka 0–9 dengan pola yang dikenal.
//
// Cara kerjanya: piksel di DALAM oval dibuang lebih dulu (alpha 0). Oval lalu
// diisi ulang dari warna CINCIN DI SEKELILINGNYA yang di-blur. Tekniknya
// normalized convolution: blur kanvas bekerja pada warna premultiplied, jadi
// piksel transparan tidak menyumbang apa pun. Hasilnya noda kabur lembut yang
// menyatu dengan latar. Nol informasi dari isi asli ikut terbawa, jadi sama
// amannya dengan kotak padat. Ini dibuktikan uji: dua foto yang hanya berbeda
// DI DALAM oval menghasilkan keluaran identik byte-per-byte.
//
// Bentuk: admin menarik kotak, dan oval yang dipakai MEMBUNGKUS kotak itu
// (melewati keempat sudutnya, sumbu = setengah sisi × √2). Dengan begitu ujung
// tulisan di sudut tarikan tidak ada yang tersisa. Tarikan persegi = lingkaran.
//
// Satu fungsi (gambarDenganPenutup) dipakai pratinjau SensorFoto, kartu draf,
// dan olahFoto (unggahan), sehingga yang terlihat = yang tersimpan.

/** Kotak tarikan dalam PECAHAN (0–1) terhadap lebar/tinggi foto — tak bergantung ukuran layar. */
export interface KotakSensor { x: number; y: number; w: number; h: number }

const AKAR2 = Math.SQRT2;
/** Oval sedikit diperlebar agar piksel tepi yang setengah-isi tidak ikut tersisa. */
const LEBIHAN_PX = 2;
/** Regulasi normalized convolution: di titik yang nyaris tanpa sumbangan cincin, warna menuju rata-rata cincin. */
const EPS = 0.02;
const BUTIR = 4; // amplitudo grain ±, supaya tidak tampak datar/plastik
const WARNA_CADANGAN: [number, number, number] = [148, 163, 184];

/** Oval pembungkus kotak, dalam piksel kanvas W×H. Juga dipakai pratinjau tarikan (dalam pecahan, W=H=1). */
export function ovalDari(k: KotakSensor, W: number, H: number) {
  return {
    cx: (k.x + k.w / 2) * W,
    cy: (k.y + k.h / 2) * H,
    rx: (k.w / 2) * W * AKAR2,
    ry: (k.h / 2) * H * AKAR2,
  };
}

export function muatGambar(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal membaca gambar'));
    img.src = url;
  });
}

function kanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas tidak tersedia');
  return { c, ctx };
}

/** Terapkan satu penutup oval pada ctx (W×H) — di tempat. */
function satuPenutup(ctx: CanvasRenderingContext2D, W: number, H: number, k: KotakSensor, rng: () => number) {
  const { cx, cy, rx: rx0, ry: ry0 } = ovalDari(k, W, H);
  const rx = rx0 + LEBIHAN_PX, ry = ry0 + LEBIHAN_PX;
  const s = Math.min(250, Math.max(3, 0.8 * Math.min(rx, ry)));    // sigma blur
  const bulu = Math.max(2, 0.2 * Math.min(rx, ry));               // tepi lembut DI LUAR oval
  const jangkau = Math.ceil(3 * s + bulu);
  const x0 = Math.max(0, Math.floor(cx - rx - jangkau)), y0 = Math.max(0, Math.floor(cy - ry - jangkau));
  const x1 = Math.min(W, Math.ceil(cx + rx + jangkau)), y1 = Math.min(H, Math.ceil(cy + ry + jangkau));
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return;

  // q = jarak ternormalisasi² dari pusat oval (≤ 1 = di dalam).
  const q = (px: number, py: number) => {
    const dx = (x0 + px + 0.5 - cx) / rx, dy = (y0 + py + 0.5 - cy) / ry;
    return dx * dx + dy * dy;
  };

  // A = wilayah dengan isi oval DIBUANG (alpha 0) + rata-rata warna cincin.
  const A = kanvas(w, h);
  A.ctx.drawImage(ctx.canvas, x0, y0, w, h, 0, 0, w, h);
  const da = A.ctx.getImageData(0, 0, w, h);
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      if (q(px, py) <= 1) { da.data[i] = da.data[i + 1] = da.data[i + 2] = da.data[i + 3] = 0; }
      else { sr += da.data[i]; sg += da.data[i + 1]; sb += da.data[i + 2]; n++; }
    }
  }
  A.ctx.putImageData(da, 0, 0);
  const F: [number, number, number] = n ? [sr / n, sg / n, sb / n] : WARNA_CADANGAN;

  // B = blur cincin (normalized convolution). Tanpa dukungan ctx.filter
  // (browser lama), B tetap kosong → seluruh oval diisi warna rata-rata cincin.
  const B = kanvas(w, h);
  if ('filter' in CanvasRenderingContext2D.prototype) {
    B.ctx.filter = `blur(${s.toFixed(1)}px)`;
    B.ctx.drawImage(A.c, 0, 0);
  }
  const db = B.ctx.getImageData(0, 0, w, h);

  const C = kanvas(w, h);
  const dc = C.ctx.createImageData(w, h);
  const batasBulu = (1 + bulu / Math.min(rx, ry)) ** 2;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const qq = q(px, py);
      if (qq > batasBulu) continue;
      const i = (py * w + px) * 4;
      const a = db.data[i + 3] / 255;
      const g = (rng() - 0.5) * 2 * BUTIR;
      for (let ch = 0; ch < 3; ch++) {
        dc.data[i + ch] = Math.round((db.data[i + ch] * a + F[ch] * EPS) / (a + EPS) + g);
      }
      dc.data[i + 3] = qq <= 1 ? 255 : Math.round(255 * (1 - (Math.sqrt(qq) - 1) / (Math.sqrt(batasBulu) - 1)));
    }
  }
  C.ctx.putImageData(dc, 0, 0);
  ctx.drawImage(C.c, x0, y0);
}

/** Terapkan semua penutup berurutan (yang belakangan melihat hasil yang sebelumnya). */
export function terapkanPenutup(ctx: CanvasRenderingContext2D, W: number, H: number, kotak: KotakSensor[], rng: () => number = Math.random) {
  for (const k of kotak) satuPenutup(ctx, W, H, k, rng);
}

/**
 * Gambar `img` ke `canvas` (sisi terpanjang ≤ sisiMaks) lalu terapkan penutup.
 * Dipakai pratinjau DAN unggahan, jadi yang terlihat = yang tersimpan.
 */
export function gambarDenganPenutup(canvas: HTMLCanvasElement, img: HTMLImageElement, kotak: KotakSensor[], sisiMaks: number, rng: () => number = Math.random) {
  const skala = Math.min(1, sisiMaks / Math.max(img.naturalWidth, img.naturalHeight));
  canvas.width = Math.max(1, Math.round(img.naturalWidth * skala));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * skala));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas tidak tersedia');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  terapkanPenutup(ctx, canvas.width, canvas.height, kotak, rng);
}
