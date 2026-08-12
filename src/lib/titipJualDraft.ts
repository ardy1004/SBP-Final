// Draft otomatis form Titip Jual (localStorage).
//
// LATAR BELAKANG (audit 12 Agu 2026)
// Form ini SAMA SEKALI tidak punya penyimpanan sementara: seluruh isian Step 1
// dan Step 2 hidup di useState. Owner yang mengisi lalu gagal submit (403
// Turnstile, koneksi putus, tab tertutup, HP mati) kehilangan semuanya —
// nomor WA-nya pun tidak tersisa di admin. Pesan error 403 kita sendiri bahkan
// menyuruh "muat ulang halaman", yang justru menghapus hasil kerjanya.
//
// Idiom mengikuti autosave ViralFrame (`vf_draft_<id>` di
// AdminViralFrameWorkspacePage): try/catch diam, stempel `ts`, hapus saat
// selesai. Bedanya di sini kuncinya tunggal — form publik, tanpa id entitas.
//
// ⚠️ DUA HAL YANG TIDAK BOLEH IKUT DISIMPAN
// 1. NIK — data pribadi mentah di perangkat yang mungkin dipakai bersama.
//    Seluruh proyek ini menyimpan NIK dalam keadaan terenkripsi (encryptNIK +
//    NIK_ENC_KEY); menaruh salinan polos di localStorage membatalkan itu demi
//    menghemat 16 digit ketikan. `bacaDraft()` MENJATUHKAN field `nik` walau
//    versi lama sempat menuliskannya.
// 2. FOTO — 20 foto base64 = 8–11 MB, di atas kuota localStorage (±5 MB).
//    Menulisnya melempar QuotaExceededError yang menggagalkan SELURUH autosave,
//    jadi bukan cuma foto yang hilang tapi semua field juga. Yang disimpan
//    hanya jumlahnya, supaya UI bisa memberi tahu berapa foto perlu dipilih ulang.

const KEY = 'sbp_titipjual_draft';

/** Draft lebih tua dari ini dianggap basi — harga/properti sudah berubah. */
const MAKS_UMUR_MS = 14 * 24 * 60 * 60 * 1000;

export interface TitipJualDraft {
  v: 1;
  /** Field Step 1 TANPA `nik`. */
  s1?: Record<string, unknown>;
  s2?: Record<string, unknown>;
  /** id baris `leads` prospek — dipakai agar klik "Lanjut" berulang meng-UPDATE, bukan menambah baris. */
  leadId?: number;
  /**
   * Kunci idempotensi submit, tetap sama sepanjang satu sesi form termasuk saat
   * mencoba ulang. Mencegah percobaan kedua melahirkan listing kedua ketika
   * percobaan pertama sebenarnya sudah tersimpan tapi response-nya tidak sampai.
   * Lihat migrations/0042_titipjual_submit_id.sql.
   */
  submitId?: string;
  /** Berapa foto yang sempat dipilih (file-nya sendiri tidak bisa disimpan). */
  jumlahFoto?: number;
  ts: number;
}

/**
 * Baca draft. Mengembalikan null bila tidak ada, rusak, basi, atau versinya beda.
 * Aman dipanggil di SSR (mengembalikan null) — tapi pemanggil TETAP wajib
 * memanggilnya dari useEffect, bukan saat render: hasil yang berbeda antara
 * server dan client = hydration mismatch (lihat aturan di CLAUDE.md).
 */
export function bacaDraft(): TitipJualDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as TitipJualDraft;
    if (!d || d.v !== 1 || typeof d.ts !== 'number') return null;
    if (Date.now() - d.ts > MAKS_UMUR_MS) { hapusDraft(); return null; }
    // Buang NIK yang mungkin tertulis oleh build lama — draft adalah input
    // tidak tepercaya, bentuknya bisa berasal dari versi mana pun.
    if (d.s1 && 'nik' in d.s1) delete d.s1.nik;
    return d;
  } catch {
    return null;
  }
}

/** Gabung sebagian isi ke draft yang sudah ada. Gagal-diam (kuota penuh / mode privat). */
export function simpanDraft(patch: Partial<Omit<TitipJualDraft, 'v' | 'ts'>>): void {
  if (typeof window === 'undefined') return;
  try {
    const lama = bacaDraft();
    const baru: TitipJualDraft = { ...lama, ...patch, v: 1, ts: Date.now() };
    if (baru.s1 && 'nik' in baru.s1) delete baru.s1.nik;
    localStorage.setItem(KEY, JSON.stringify(baru));
  } catch {
    /* kuota penuh atau Safari private mode — autosave memang best-effort */
  }
}

export function hapusDraft(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}
