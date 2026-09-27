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

/**
 * Umur `submitId`. Jauh lebih pendek daripada draft, dan itu disengaja:
 * idempotensi hanya berguna untuk percobaan ulang dalam hitungan menit —
 * "kirim lagi karena responsnya tidak sampai". Di luar jendela itu, memakai
 * ulang submitId justru membajak pengisian properti BERIKUTNYA: server
 * mengembalikan listing lama dan tidak membuat yang baru.
 * 2 jam = lapang untuk satu sesi pengisian panjang di HP, jauh dari 14 hari.
 */
const MAKS_UMUR_SUBMIT_ID_MS = 2 * 60 * 60 * 1000;

/**
 * submitId yang masih sah untuk dipakai ulang, atau null bila sudah lewat umur.
 * Pemanggil membuat yang baru saat menerima null.
 */
export function submitIdMasihSah(d: TitipJualDraft | null): string | null {
  if (!d?.submitId) return null;
  // Draft dari build lama tidak punya submitIdTs — perlakukan sebagai basi,
  // justru karena itulah bentuk yang menyimpan submitId berumur berhari-hari.
  if (typeof d.submitIdTs !== 'number') return null;
  if (Date.now() - d.submitIdTs > MAKS_UMUR_SUBMIT_ID_MS) return null;
  return d.submitId;
}

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
  /**
   * Kapan `submitId` di atas dibuat. WAJIB terpisah dari `ts`.
   *
   * 🔥 `ts` diperbarui SETIAP simpanDraft (tiap ketikan yang di-autosave), jadi
   * batas 14 hari di bawah praktis tidak pernah tercapai selama form sesekali
   * dibuka. Akibatnya `submitId` berperilaku sebagai kunci PER-BROWSER, bukan
   * per-properti: sekali ia berhasil membuat listing, setiap pengisian
   * BERIKUTNYA dari perangkat itu dibalas jalur idempoten — properti baru tidak
   * pernah lahir, dan layarnya tetap bilang berhasil.
   *
   * Jalurnya: blok `catch` di handleSubmit sengaja TIDAK menghapus draft (benar,
   * supaya percobaan ulang aman), tapi bila pengunjung tidak mencoba ulang saat
   * itu juga, submitId-nya tertinggal selamanya.
   */
  submitIdTs?: number;
  /** Berapa foto yang sempat dipilih (file-nya sendiri tidak bisa disimpan). */
  jumlahFoto?: number;
  /**
   * Tiket ber-HMAC untuk /api/titip-jual-foto, diterbitkan
   * /api/titip-jual-tiket-foto saat StepProperti mount. Berumur 1 jam dan
   * cakupannya HANYA mengunggah foto ke bucket kita — bukan kredensial akun.
   * Disimpan di sini (bukan state komponen) karena StepProperti dan
   * StepDataDiri komponen terpisah, persis alasan `leadId` ada di sini.
   */
  tiketFoto?: string;
  /**
   * Tiket JWT (scope `titipjual-lanjut`) yang dikembalikan
   * /api/titip-jual-mulai di akhir Tahap 1 (StepProperti) — satu-satunya kunci
   * menuju Tahap 2 (StepDataDiri, opsional). Berumur 7 hari: user boleh kembali
   * besok/lusa untuk melengkapi data diri, bukan hanya dalam satu sesi.
   * `property_id`/`owner_id` TIDAK pernah disimpan mentah di draft — keduanya
   * hanya hidup di dalam isi tiket ini, diverifikasi server, supaya klien tidak
   * bisa mengarang property_id sendiri (IDOR — lihat
   * PLAN-TITIP-JUAL-PROPERTI-DULU.md §2.3).
   */
  tiketLanjut?: string;
  /** Kode listing dari respons Tahap 1 — ditampilkan ulang bila user reload sebelum lanjut Tahap 2. */
  kodeListingTahap1?: string;
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

/**
 * Isi (payload) tiket JWT, TANPA verifikasi tanda tangan — hanya untuk hal yang
 * aman ditebak klien: kapan kedaluwarsa (`exp`) dan kode listing untuk tampilan.
 * Keabsahan tiket tetap sepenuhnya diputuskan server.
 */
export function bacaPayloadTiket(tiket: string | null | undefined): { exp?: number; kode_listing?: string } | null {
  if (!tiket || typeof tiket !== 'string') return null;
  try {
    const b64 = (tiket.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    const j = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    return j && typeof j === 'object' ? j : null;
  } catch {
    return null;
  }
}

/** Tiket masih berlaku minimal `sisaDetik` lagi? Tiket tanpa `exp` dianggap tidak berlaku. */
export function tiketMasihBerlaku(tiket: string | null | undefined, sisaDetik = 0): boolean {
  const exp = bacaPayloadTiket(tiket)?.exp;
  return typeof exp === 'number' && exp * 1000 > Date.now() + sisaDetik * 1000;
}

export function hapusDraft(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}
