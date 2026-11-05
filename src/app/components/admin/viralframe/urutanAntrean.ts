// Penyusun ulang antrean kirim Konten Agent — fungsi MURNI (tanpa React/DOM),
// supaya bisa diuji langsung di Node.
//
// KENAPA ADA (2026-11-05). Video baru selalu masuk di UJUNG BAWAH antrean
// (agent-videos/index.js: MAX(urutan_kirim)+1000). Dengan ratusan video,
// menaikkannya lewat drag & drop berarti menyeret satu kartu melintasi ratusan
// kartu lain — dan diulang per video. Fungsi di sini memindahkan banyak video
// sekaligus.
//
// ⚠️ KONTRAK: setiap fungsi WAJIB mengembalikan PERMUTASI PENUH dari masukannya
// — tidak menambah, tidak membuang, tidak menggandakan. Endpoint
// agent-videos/reorder.js menolak (422) apa pun yang bukan permutasi persis
// seluruh video aktif karakter itu. Karena itu fungsi-fungsi ini selalu
// bekerja pada urutan GLOBAL (semua video aktif), bukan pada subset yang
// sedang tampil saat filter rasio menyala.

export type StatusProperti = 'sold' | 'premium' | 'featured' | 'hot' | 'pilihan';

// Kalau beberapa status berlaku sekaligus, hanya yang tertinggi yang tampil di
// kartu. SOLD di depan: properti terjual tidak boleh tampil sebagai "Premium".
export const STATUS_PRIORITAS: StatusProperti[] = ['sold', 'premium', 'featured', 'hot', 'pilihan'];

export interface FlagStatus {
  status_sold?: number | null;
  badge_premium?: number | null;
  badge_featured?: number | null;
  badge_hot?: number | null;
  properti_pilihan?: number | null;
}

export function pickStatusProperti(v: FlagStatus): StatusProperti | null {
  const aktif: Record<StatusProperti, boolean> = {
    sold: !!v.status_sold, premium: !!v.badge_premium, featured: !!v.badge_featured,
    hot: !!v.badge_hot, pilihan: !!v.properti_pilihan,
  };
  return STATUS_PRIORITAS.find(t => aktif[t]) ?? null;
}

export interface VideoAntre extends FlagStatus {
  id: number;
  property_id: number;
}

// ── Pindah berdasarkan pilihan ───────────────────────────────────────────────
// Urutan RELATIF video terpilih selalu dipertahankan: memilih #40, #12, #300
// lalu "Paling atas" menghasilkan #12, #40, #300 di depan — bukan urutan klik.

export function keAtas(ids: readonly number[], dipilih: ReadonlySet<number>): number[] {
  const atas = ids.filter(id => dipilih.has(id));
  if (atas.length === 0) return ids.slice();
  return [...atas, ...ids.filter(id => !dipilih.has(id))];
}

export function keBawah(ids: readonly number[], dipilih: ReadonlySet<number>): number[] {
  const bawah = ids.filter(id => dipilih.has(id));
  if (bawah.length === 0) return ids.slice();
  return [...ids.filter(id => !dipilih.has(id)), ...bawah];
}

/** Posisi tertinggi yang masih masuk akal untuk `jumlahDipilih` video. */
export function posisiMaks(total: number, jumlahDipilih: number): number {
  return Math.max(1, total - jumlahDipilih + 1);
}

/**
 * Video terpilih PERTAMA menjadi nomor antrean ke-`n` (1 = paling depan),
 * sisanya menyusul tepat di belakangnya. `n` di luar rentang dijepit, bukan
 * ditolak — mengetik 999 pada antrean 300 berarti "paling bawah".
 */
export function kePosisi(ids: readonly number[], dipilih: ReadonlySet<number>, n: number): number[] {
  const pindah = ids.filter(id => dipilih.has(id));
  if (pindah.length === 0 || !Number.isFinite(n)) return ids.slice();
  const sisa = ids.filter(id => !dipilih.has(id));
  const pos = Math.min(Math.max(1, Math.trunc(n)), sisa.length + 1);
  return [...sisa.slice(0, pos - 1), ...pindah, ...sisa.slice(pos - 1)];
}

// ── Susun otomatis ───────────────────────────────────────────────────────────

/**
 * Jumlah pasangan BERSEBELAHAN yang berasal dari listing yang sama — ukuran
 * "seberapa menggumpal" antrean. Dua video properti yang sama terbit
 * berturut-turut terlihat seperti spam bagi penonton yang sama.
 */
export function hitungBeruntun(videos: readonly VideoAntre[]): number {
  let n = 0;
  for (let i = 1; i < videos.length; i++) {
    if (videos[i].property_id === videos[i - 1].property_id) n++;
  }
  return n;
}

/**
 * Selang-seling listing: sesedikit mungkin video dari listing yang sama
 * bersebelahan, dengan urutan asli dipertahankan sejauh mungkin.
 *
 * Tiap langkah mengambil video PALING DEPAN (menurut urutan sekarang) yang
 * listingnya beda dari video sebelumnya — jadi yang sudah di depan tetap di
 * depan. Satu pengecualian: kalau listing dengan sisa terbanyak tidak akan bisa
 * dipisah lagi bila dilewati sekarang (sisanya > sisa listing lain), ia diambil
 * duluan. Tanpa pengecualian itu, round-robin biasa menumpuk listing besar di
 * ekor (A X A X X), padahal X A X A X mungkin.
 *
 * Kalau satu listing memang mendominasi (mis. 10 dari 12 video), gumpalan tidak
 * bisa dihindari; hasilnya tetap jumlah gumpalan paling kecil yang mungkin.
 */
export function selangSelingListing<T extends VideoAntre>(videos: readonly T[]): T[] {
  // Antrean per listing, urutan asli dipertahankan. `idx` = posisi asli.
  const grup = new Map<number, { item: T; idx: number }[]>();
  videos.forEach((item, idx) => {
    const g = grup.get(item.property_id);
    if (g) g.push({ item, idx }); else grup.set(item.property_id, [{ item, idx }]);
  });
  const ptr = new Map<number, number>();
  for (const k of grup.keys()) ptr.set(k, 0);

  const out: T[] = [];
  let prev: number | null = null;
  let sisaTotal = videos.length;

  while (sisaTotal > 0) {
    // Listing dengan sisa terbanyak; seri dipecah oleh video yang lebih depan.
    let maksKey: number | null = null;
    let maksSisa = 0;
    let maksIdx = Infinity;
    for (const [k, arr] of grup) {
      const p = ptr.get(k)!;
      const s = arr.length - p;
      if (s === 0) continue;
      if (s > maksSisa || (s === maksSisa && arr[p].idx < maksIdx)) {
        maksKey = k; maksSisa = s; maksIdx = arr[p].idx;
      }
    }

    let pilih: number | null = null;
    if (maksKey !== prev && maksSisa > sisaTotal - maksSisa) {
      pilih = maksKey;
    } else {
      let terdepan = Infinity;
      for (const [k, arr] of grup) {
        const p = ptr.get(k)!;
        if (p >= arr.length || k === prev) continue;
        if (arr[p].idx < terdepan) { terdepan = arr[p].idx; pilih = k; }
      }
      // Tinggal satu listing yang tersisa — gumpalan tidak terhindarkan.
      if (pilih === null) pilih = prev;
    }

    const p = ptr.get(pilih!)!;
    out.push(grup.get(pilih!)![p].item);
    ptr.set(pilih!, p + 1);
    prev = pilih;
    sisaTotal--;
  }
  return out;
}

// Peringkat unggulan: Premium > Featured > Hot > Pilihan > lainnya. Properti
// SOLD dianggap "lainnya" walau ber-badge — mempromosikan properti terjual ke
// depan antrean justru kebalikan dari maksud tombol ini.
const PERINGKAT_UNGGULAN: Partial<Record<StatusProperti, number>> = {
  premium: 0, featured: 1, hot: 2, pilihan: 3,
};

/** Stabil: urutan di dalam satu peringkat tidak berubah. */
export function unggulanKeAtas<T extends VideoAntre>(videos: readonly T[]): T[] {
  const peringkat = (v: T) => {
    const s = pickStatusProperti(v);
    return s ? (PERINGKAT_UNGGULAN[s] ?? 4) : 4;
  };
  return videos
    .map((v, idx) => ({ v, idx, r: peringkat(v) }))
    .sort((a, b) => a.r - b.r || a.idx - b.idx)
    .map(x => x.v);
}

/** Stabil: video properti SOLD pindah ke belakang, urutan lainnya tetap. */
export function soldKeBawah<T extends VideoAntre>(videos: readonly T[]): T[] {
  return [...videos.filter(v => !v.status_sold), ...videos.filter(v => !!v.status_sold)];
}

// ── Utilitas ─────────────────────────────────────────────────────────────────

/** Susun ulang objek menurut daftar id. Id yang tidak dikenal diabaikan. */
export function susunMenurutId<T extends { id: number }>(items: readonly T[], ids: readonly number[]): T[] {
  const peta = new Map(items.map(v => [v.id, v]));
  const out: T[] = [];
  for (const id of ids) {
    const v = peta.get(id);
    if (v) out.push(v);
  }
  return out;
}

export function urutanSama(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
