/**
 * SBP API Client — satu-satunya tempat fetch ke Workers API.
 * Base URL: relatif '/api' — berfungsi di kedua mode dev:
 *   - npm run api:dev (:8787): Worker langsung handle
 *   - npm run dev (:5173): Vite proxy teruskan ke :8787
 */

const BASE = '/api';

// ─────────────────────────────────────────────────────────────────────────────
// TIPE RAW API (sesuai response JSON dari Worker)
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: Record<string, string>;
}

/**
 * Baca body JSON sebagai amplop standar `{success, data, error}` yang dihasilkan
 * jsonOk()/jsonError() di functions/api/_shared/response.js.
 *
 * KENAPA HELPER INI ADA. `Response.json()` bertipe `Promise<any>` di lib DOM
 * lama, tapi `Promise<unknown>` di TypeScript modern. Setelah type checking
 * dinyalakan (26 Juli 2026), 76 pemanggilan `await res.json()` di panel admin
 * melahirkan 165 error "Property 'success' does not exist on type 'unknown'".
 * Semuanya berasal dari satu sebab yang sama, jadi diperbaiki di satu tempat
 * alih-alih menaburkan `as any` ke seluruh berkas.
 *
 * `T = any` DISENGAJA sebagai langkah pertama: tujuannya menutup 165 error
 * tanpa memaksa 76 pemanggil menuliskan tipe payload sekarang juga. Pemanggil
 * yang tahu bentuk datanya sebaiknya menyebutkannya — `bacaJson<Lead[]>(res)` —
 * dan dengan begitu pengetatan bisa berjalan bertahap per-berkas.
 */
export async function bacaJson<T = any>(res: Response): Promise<ApiResponse<T>> {
  // Body kosong / bukan JSON (mis. halaman error HTML dari platform) tidak boleh
  // melempar SyntaxError mentah ke UI — kembalikan amplop gagal yang bisa dibaca.
  try {
    return await res.json() as ApiResponse<T>;
  } catch {
    return {
      success: false,
      error: `Server mengembalikan respons tak terduga (HTTP ${res.status}).`,
    };
  }
}

/** Item properti dari GET /api/properties (list) */
export interface ApiPropertyListItem {
  id: number;
  kode_listing: string;
  title: string;
  slug: string;
  jenis_properti: string;
  tujuan: 'dijual' | 'disewa' | 'dijual_disewa';
  harga: number;
  harga_lama: number | null;
  harga_sewa_tahun: number | null;
  nego: number;          // 0|1 — SQLite boolean
  nett: number;
  harga_per_m2: number | null;
  /** 'per_m2' = tanah yang diiklankan per meter; tampilkan per-m2 sebagai
   *  angka utama. Kolom `harga` TETAP total apa pun modenya. */
  harga_mode?: 'total' | 'per_m2';
  jumlah_kamar_tidur: number | null;
  jumlah_kamar_mandi: number | null;
  luas_tanah: number | null;
  luas_bangunan: number | null;
  lebar_depan: number | null;
  lantai: number | null;
  legalitas: string;
  // Opsional karena ApiPropertyDetail meng-extend interface ini, sedangkan
  // jalur detail tidak selalu membawanya: field ini hanya dipakai badge di
  // PropertyCard ("Sertif Di Tangan"/"Di Bank"), bukan halaman detail.
  status_legalitas?: string | null;
  furnished: string | null;
  kecamatan: string;
  kabupaten: string;
  provinsi: string;
  badge_premium: number;
  badge_featured: number;
  badge_hot: number;
  status_sold: number;
  properti_pilihan: number;
  verified: number;
  income_per_bulan: number | null;
  pengeluaran_per_bulan: number | null;
  views_count: number;
  published_at: string;
  updated_at: string;
  cover_url: string | null;
  cover_alt: string | null;
  // HANYA ada di respons DAFTAR (GROUP_CONCAT url_webp dipisah '|||', maks 5)
  // untuk slider di kartu. Respons DETAIL memakai `images: ApiImage[]` sebagai
  // gantinya, jadi field ini wajib opsional agar ApiPropertyDetail valid.
  images_raw?: string | null;
}

export interface ApiPagination {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface ApiPropertiesData {
  items: ApiPropertyListItem[];
  pagination: ApiPagination;
}

/** Investment Intelligence dari GET /api/properties/:slug */
export interface InvestmentIntelligence {
  yield_persen: number;
  payback_tahun: number;
  cap_rate_persen: number;
  income_bersih_per_bulan: number;
  income_bersih_per_tahun: number;
  skor_investasi: number;
}

/** Skor Investasi 1–5 bintang dari yield% — SATU SUMBER KEBENARAN, harus identik
 * dengan hitungSkorInvestasi() di functions/api/properties/[slug].js (spec 8.4).
 * Dipakai homepage (teaser) DAN halaman detail (via investment_intelligence API)
 * agar tidak ada dua rumus berbeda yang bisa saling bertentangan. */
export function hitungSkorInvestasi(yieldPersen: number): number {
  if (yieldPersen >= 8) return 5;
  if (yieldPersen >= 6) return 4;
  if (yieldPersen >= 4) return 3;
  if (yieldPersen >= 2) return 2;
  return 1;
}

/** Properti yield tertinggi untuk teaser Investment Intelligence homepage (spec 6.7). */
export interface InvestTeaserProp {
  id: number;
  title: string;
  slug: string;
  jenis_properti: string;
  tujuan: string;
  provinsi: string;
  kabupaten: string;
  kecamatan: string | null;
  harga: number;
  income_per_bulan: number;
  pengeluaran_per_bulan: number;
  yield_persen: number;
}

/** Image dari GET /api/properties/:slug */
export interface ApiImage {
  id: number;
  url_webp: string;
  alt_text: string;
  urutan: number;
  is_cover: number;
}

/** Detail properti dari GET /api/properties/:slug */
export interface ApiPropertyDetail extends ApiPropertyListItem {
  deskripsi: string | null;
  latitude: number | null;
  longitude: number | null;
  gmaps_link: string | null;
  details: Record<string, unknown> | null;
  images: ApiImage[];
  investment_intelligence: InvestmentIntelligence | null;
  video_youtube?: string | null;
  // Dikembalikan GET /api/properties/:slug (lihat SELECT di
  // functions/api/properties/[slug].js) tapi dulu tidak dideklarasikan di sini,
  // padahal normalizePropertyDetail() membacanya. Tipe tertinggal dari API.
  meta_title?: string | null;
  meta_description?: string | null;
  // Endpoint DETAIL mengembalikan kelurahan (endpoint LIST tidak — lihat catatan
  // di normalizeProperty). Opsional supaya konsumen lama tetap valid.
  kelurahan?: string | null;
  // CATATAN: `status_legalitas` SENGAJA tidak diulang di sini — sudah opsional
  // di induknya. Dulu ia dideklarasikan ulang sebagai opsional padahal induknya
  // mewajibkannya, sehingga interface ini gagal meng-extend induk dan setiap
  // pemakaiannya sebagai ApiPropertyListItem ikut rusak.
}

export interface ApiLocation {
  id: number;
  nama: string;
  tipe: string;
  slug: string;
  parent_id: number | null;
  latitude: number | null;
  longitude: number | null;
}

export interface ApiLocationsData {
  items: ApiLocation[];
  total: number;
}

export interface ApiTestimonial {
  id: number;
  nama_klien: string;
  foto_url: string | null;
  lokasi: string | null;
  rating: number;
  isi_testimoni: string;
  jenis_transaksi: string | null;
  tanggal: string | null;
}

export interface ApiTestimonialsData {
  items: ApiTestimonial[];
  total: number;
}

export interface ApiBlogPost {
  id: number;
  judul: string;
  slug: string;
  cover: string | null;
  excerpt: string | null;
  kategori: string | null;
  tags: string[];
  reading_time_menit: number | null;
  published_at: string;
  author: string | null;
}

export interface ApiBlogData {
  items: ApiBlogPost[];
  pagination: ApiPagination;
}

/** Detail artikel dari GET /api/blog/:slug */
export interface ApiBlogDetail extends ApiBlogPost {
  konten: string | null;
  status: string;
  meta_title: string | null;
  meta_description: string | null;
  author_nama: string | null;
  created_at: string;
  updated_at: string;
}

/** Item list admin dari GET /api/admin/blog */
export interface ApiBlogAdminItem {
  id: number;
  judul: string;
  slug: string;
  kategori: string | null;
  status: string;
  published_at: string | null;
  created_at: string;
}

export interface BlogPostInput {
  judul: string;
  konten?: string;
  excerpt?: string;
  kategori?: string;
  tags?: string[];
  cover?: string;
  status?: 'draft' | 'published' | 'scheduled';
  meta_title?: string;
  meta_description?: string;
}

export interface ApiLeadRequest {
  nama: string;
  no_wa: string;
  tipe_pengirim: 'pembeli' | 'penjual' | 'broker';
  source_page: string;
  property_id?: number;
  asal_daerah?: string;
  budget?: string;
  rencana_pembayaran?: 'hard_cash' | 'soft_cash' | 'kpr';
  pesan?: string;
  /** Token Turnstile anti-bot (opsional; diverifikasi server bila TURNSTILE_SECRET di-set) */
  cf_turnstile_token?: string;
}

export interface ApiLeadResponse {
  lead_id: number;
  wa_url: string;
  wa_pesan: string;
  event_id?: string; // untuk dedup CAPI ↔ client Pixel (P4)
}

// ─────────────────────────────────────────────────────────────────────────────
// TIPE NORMALIZED (kompatibel dengan komponen UI yang sudah ada)
// ─────────────────────────────────────────────────────────────────────────────

import { getPropertyTypeLabel, getPropertyTypeEmoji } from './propertyTypes';

/**
 * Konversi ApiPropertyListItem → format Property yang dipakai komponen UI.
 * Semua perubahan field name dan 0/1 → boolean dilakukan di sini.
 */
export function normalizeProperty(p: ApiPropertyListItem) {
  const jenis = p.jenis_properti;
  return {
    id: p.id,
    kode: p.kode_listing,
    slug: p.slug,
    title: p.title,
    jenis: getPropertyTypeLabel(jenis),
    jenisRaw: jenis,
    jenisEmoji: getPropertyTypeEmoji(jenis),
    tujuan: p.tujuan,
    harga: p.harga,
    harga_lama: p.harga_lama ?? undefined,
    harga_sewa: p.harga_sewa_tahun ?? undefined,
    nego: Boolean(p.nego),
    nett: Boolean(p.nett),
    provinsi: p.provinsi,
    kabupaten: p.kabupaten,
    kecamatan: p.kecamatan,
    kelurahan: '',  // tidak ada di response list (privat)
    luas_tanah: p.luas_tanah ?? undefined,
    luas_bangunan: p.luas_bangunan ?? undefined,
    lebar_depan: p.lebar_depan ?? undefined,
    lantai: p.lantai ?? undefined,
    kamar_tidur: p.jumlah_kamar_tidur ?? undefined,
    kamar_mandi: p.jumlah_kamar_mandi ?? undefined,
    legalitas: p.legalitas,
    status_legalitas: p.status_legalitas ?? undefined,
    furnished: p.furnished ?? undefined,
    deskripsi: '',  // tidak ada di response list
    images: p.images_raw
      ? p.images_raw.split('|||').map(u => `/api/media?key=${encodeURIComponent(u)}`)
      : (p.cover_url ? [`/api/media?key=${encodeURIComponent(p.cover_url)}`] : []),
    badge_premium: Boolean(p.badge_premium),
    badge_featured: Boolean(p.badge_featured),
    badge_hot: Boolean(p.badge_hot),
    status_sold: Boolean(p.status_sold),
    properti_pilihan: Boolean(p.properti_pilihan),
    verified: Boolean(p.verified),
    views_count: p.views_count,
    income_per_bulan: p.income_per_bulan ?? undefined,
    pengeluaran_per_bulan: p.pengeluaran_per_bulan ?? undefined,
    status_publish: 'published' as const,
    published_at: p.published_at,
    updated_at: p.updated_at,
    // harga_per_m2 tersedia langsung dari API
    harga_per_m2: p.harga_per_m2 ?? undefined,
    harga_mode: p.harga_mode ?? 'total',
  };
}

export type NormalizedProperty = ReturnType<typeof normalizeProperty>;

/** Konversi ApiPropertyDetail → format detail yang dipakai halaman detail */
export function normalizePropertyDetail(p: ApiPropertyDetail) {
  const base = normalizeProperty(p);
  return {
    ...base,
    deskripsi: p.deskripsi ?? '',
    // ⚠️ Dulu di-hardcode '' di sini, menimpa nilai dari `normalizeProperty` DAN
    // membuang kelurahan yang dikembalikan endpoint detail. Akibatnya JSON-LD dan
    // halaman detail tidak pernah bisa menampilkan kelurahan meskipun datanya ada
    // di database (531 dari 533 properti terisi per 2026-08-03).
    kelurahan: p.kelurahan ?? '',
    latitude: p.latitude ?? undefined,
    longitude: p.longitude ?? undefined,
    gmaps_link: p.gmaps_link ?? undefined,
    details: p.details ?? undefined,
    images: p.images.map(img => `/api/media?key=${encodeURIComponent(img.url_webp)}`),
    imagesData: p.images,
    investment_intelligence: p.investment_intelligence ?? undefined,
    video_youtube: p.video_youtube ?? undefined,
    meta_title: p.meta_title ?? null,
    meta_description: p.meta_description ?? null,
  };
}

export type NormalizedPropertyDetail = ReturnType<typeof normalizePropertyDetail>;

// ─────────────────────────────────────────────────────────────────────────────
// FUNGSI FETCH — semua pakai { success, data, error } pattern
// ─────────────────────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      ...init,
    });
    const json = await res.json() as ApiResponse<T>;
    return json;
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/** GET /api/health */
export async function getHealth() {
  return apiFetch<{ db: string; locations_count: number; timestamp: string; environment: string }>('/health');
}

/** GET /api/locations?parent_id= */
export async function getLocations(parentId?: number) {
  const qs = parentId != null ? `?parent_id=${parentId}` : '';
  return apiFetch<ApiLocationsData>(`/locations${qs}`);
}

/** GET /api/locations?all=1 — semua lokasi (semua level) untuk index smart-search */
export async function getAllLocations() {
  return apiFetch<ApiLocationsData>(`/locations?all=1`);
}

export interface PropertiesParams {
  tujuan?: string;
  jenis?: string;
  provinsi?: string;
  kabupaten?: string;
  kecamatan?: string;
  kelurahan?: string;
  harga_min?: number;
  harga_max?: number;
  kt?: number;
  km?: number;
  lantai?: number;
  lt?: number;
  lb?: number;
  q?: string;
  sort?: 'terbaru' | 'termurah' | 'termahal' | 'luas' | 'yield';
  page?: number;
  limit?: number;
}

/** GET /api/properties — list dengan filter & pagination */
export async function getProperties(params: PropertiesParams = {}) {
  const q = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== '' && val !== 0) {
      q.set(key, String(val));
    }
  }
  const qs = q.toString() ? `?${q.toString()}` : '';
  return apiFetch<ApiPropertiesData>(`/properties${qs}`);
}

/** GET /api/properties/:slug — detail 1 properti */
export async function getPropertyBySlug(slug: string) {
  return apiFetch<ApiPropertyDetail>(`/properties/${slug}`);
}

export interface MapPinItem {
  id: number;
  slug: string;
  title: string;
  harga: number;
  tujuan: string;
  jenis_properti: string;
  provinsi: string;
  kecamatan: string;
  kabupaten: string;
  luas_tanah: number | null;
  luas_bangunan: number | null;
  jumlah_kamar_tidur: number | null;
  jumlah_kamar_mandi: number | null;
  latitude: number;
  longitude: number;
  cover_url: string | null;
}

/** GET /api/properties/map — pin peta (hanya properti berkoordinat) */
export async function getMapProperties(params: { tujuan?: string; jenis?: string; kabupaten?: string } = {}) {
  const q = new URLSearchParams();
  if (params.tujuan) q.set('tujuan', params.tujuan);
  if (params.jenis)  q.set('jenis', params.jenis);
  if (params.kabupaten) q.set('kabupaten', params.kabupaten);
  const qs = q.toString() ? `?${q.toString()}` : '';
  return apiFetch<{ items: MapPinItem[] }>(`/properties/map${qs}`);
}

/** POST /api/leads ⚠️ K6 kritis */
export async function postLead(body: ApiLeadRequest) {
  return apiFetch<ApiLeadResponse>('/leads', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** POST /api/admin/login */
export async function adminLogin(email: string, password: string) {
  return apiFetch<{ nama: string; role: string }>('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

/** POST /api/admin/logout */
export async function adminLogout() {
  return apiFetch<{ message: string }>('/admin/logout', { method: 'POST' });
}

/** GET /api/admin/me */
export async function getAdminMe() {
  return apiFetch<{ sub: number; email: string; nama: string; role: string }>('/admin/me');
}

// ─── AI Providers (ViralFrame multi-provider) ────────────────────────────────
export type AiProviderId = 'gemini' | 'groq' | 'openrouter' | 'deepseek';
export interface AiKeyInfo { configured: boolean; masked: string | null; source: 'db' | 'secret' | null }
export interface AiStatusInfo { color: 'green' | 'yellow' | 'red'; detail: string; configured: boolean }

/** GET /api/admin/settings/ai-keys — key ter-mask per provider */
export async function getAiKeys() {
  return apiFetch<Record<AiProviderId, AiKeyInfo>>('/admin/settings/ai-keys');
}

/** PATCH /api/admin/settings/ai-keys — simpan key (kirim hanya yang diubah) */
export async function saveAiKeys(body: Partial<Record<AiProviderId, string>>) {
  return apiFetch<{ updated: string[] }>('/admin/settings/ai-keys', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/** GET /api/admin/settings/ai-status — status kuota (hijau/kuning/merah) per provider */
export async function getAiStatus() {
  return apiFetch<Record<AiProviderId, AiStatusInfo>>('/admin/settings/ai-status');
}

/** GET /api/admin/viralframe/models?provider= — daftar model tersedia */
export async function getAiModels(provider: AiProviderId) {
  return apiFetch<{ provider: string; default: string; models: string[] }>(
    `/admin/viralframe/models?provider=${encodeURIComponent(provider)}`,
  );
}

// ── Scheduler ViralFrame (Buffer + Zernio) ──────────────────────────────────
export type SchedulerProviderId = 'buffer' | 'zernio';
export interface SchedulePresetRow { slot: number; time: string }
/** Hanya preset jam yang masih global. Key & channel ID milik masing-masing
 *  agent (migrasi 0037/0038) — lihat AgentAccount di bawah. */
export interface SchedulerConfig {
  viralframe_schedule_preset: SchedulePresetRow[];
}

/** GET /api/admin/settings/scheduler-config — preset jam posting */
export async function getSchedulerConfig() {
  return apiFetch<SchedulerConfig>('/admin/settings/scheduler-config');
}

/** PATCH /api/admin/settings/scheduler-config */
export async function saveSchedulerConfig(body: Partial<SchedulerConfig>) {
  return apiFetch<{ updated: true }>('/admin/settings/scheduler-config', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export interface SchedulerAccountsResult {
  buffer: { ok: boolean; error?: string; channels?: { id: string; name: string; service: string }[] };
  zernio: { ok: boolean; error?: string; accounts?: { id: string | null; platform: string | null; name: string | null; raw?: unknown }[] };
}

/** GET /api/admin/settings/scheduler-accounts?character_id= — daftar channel Buffer
 *  & akun Zernio yang tertaut pada akun agent tsb (untuk mengisi channel ID). */
export async function getSchedulerAccounts(characterId: number) {
  return apiFetch<SchedulerAccountsResult>(`/admin/settings/scheduler-accounts?character_id=${characterId}`);
}

// ── Akun per agent (storage Cloudinary + scheduler) ─────────────────────────
// Rahasia hanya diterima dalam bentuk ter-mask. Mengirim balik nilai ber-'•'
// saat menyimpan = "jangan ubah field ini" (backend melewatinya).
export type SchedulerPlatform = 'youtube' | 'tiktok' | 'threads' | 'facebook' | 'instagram';
/** Provider ditentukan PER PLATFORM per agent — bukan pasangan tetap. Akun Monica
 *  menaruh Threads di Buffer & Instagram di Zernio; agent lain kebalikannya.
 *  Lihat migrasi 0038. */
export type AgentChannels = Partial<Record<SchedulerPlatform, { provider: SchedulerProviderId; id: string }>>;

export interface AgentAccount {
  character_id: number;
  nama: string;
  gmail: string;
  spesialis: string[];
  cloudinary_name: string;
  cloudinary_api_key: string;
  cloudinary_api_secret_masked: string | null;
  buffer_api_key_masked: string | null;
  zernio_api_key_masked: string | null;
  channels: AgentChannels;
  storage_siap: boolean;
  scheduler_siap: boolean;
  video_aktif: number;
}

export interface AgentAccountInput {
  gmail?: string;
  spesialis?: string[];
  cloudinary_name?: string;
  cloudinary_api_key?: string;
  cloudinary_api_secret?: string;
  buffer_api_key?: string;
  zernio_api_key?: string;
  channels?: AgentChannels;
}

/** GET /api/admin/viralframe/agent-accounts */
export async function getAgentAccounts() {
  return apiFetch<{ items: AgentAccount[] }>('/admin/viralframe/agent-accounts');
}

/** PUT /api/admin/viralframe/agent-accounts/:id */
export async function saveAgentAccount(characterId: number, body: AgentAccountInput) {
  return apiFetch<{ updated: string[] }>(`/admin/viralframe/agent-accounts/${characterId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/** POST /api/admin/viralframe/agent-accounts/:id/copy-badges — pindahkan badge/logo ke cloud agent */
export async function copyAgentBadges(characterId: number) {
  return apiFetch<{ disalin: number; jenis?: string[]; gagal: { type: string; error: string }[]; pesan?: string }>(
    `/admin/viralframe/agent-accounts/${characterId}/copy-badges`,
    { method: 'POST' },
  );
}

export type ScheduleSlotStatus = 'available' | 'used' | 'passed';
export interface ScheduleSlotUsedBy {
  video_id: number;
  video_type: 'library' | 'agent';
  video_name: string;
  platforms: { platform: string; status: 'scheduled' | 'failed'; error: string | null }[];
}
export interface ScheduleSlot {
  slot: number;
  time_wib: string;
  base_time: string;
  scheduled_at: string;
  status: ScheduleSlotStatus;
  used_by: ScheduleSlotUsedBy | null;
}

/** GET /api/admin/viralframe/schedule/status — status 5 slot primetime hari ini */
export async function getScheduleSlotsStatus() {
  return apiFetch<{ slots: ScheduleSlot[]; drift_minutes: number }>('/admin/viralframe/schedule/status');
}

/** GET /api/testimonials */
export async function getTestimonials() {
  return apiFetch<ApiTestimonialsData>('/testimonials');
}

/** GET /api/blog */
export async function getBlogPosts(params: { limit?: number; page?: number } = {}) {
  const q = new URLSearchParams();
  if (params.limit) q.set('limit', String(params.limit));
  if (params.page)  q.set('page',  String(params.page));
  const qs = q.toString() ? `?${q.toString()}` : '';
  return apiFetch<ApiBlogData>(`/blog${qs}`);
}

/** GET /api/blog/:slug — detail 1 artikel publik */
export async function getBlogBySlug(slug: string) {
  return apiFetch<ApiBlogDetail>(`/blog/${slug}`);
}

/** GET /api/admin/blog — list semua artikel (admin) */
export async function getBlogPostsAdmin() {
  return apiFetch<{ items: ApiBlogAdminItem[]; total: number }>('/admin/blog');
}

/** POST /api/admin/blog — buat artikel baru */
export async function createBlogPost(input: BlogPostInput) {
  return apiFetch<{ id: number; slug: string }>('/admin/blog', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** GET /api/admin/blog/:id — detail artikel (admin, semua status) */
export async function getBlogPostAdmin(id: number) {
  return apiFetch<ApiBlogDetail>(`/admin/blog/${id}`);
}

/** PATCH /api/admin/blog/:id — update artikel */
export async function updateBlogPost(id: number, input: Partial<BlogPostInput>) {
  return apiFetch<{ pesan: string }>(`/admin/blog/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/** DELETE /api/admin/blog/:id — hapus artikel */
export async function deleteBlogPost(id: number) {
  return apiFetch<{ success: boolean }>(`/admin/blog/${id}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────────────────
// RE-EXPORT formatRupiah agar komponen tidak perlu import dari dua tempat
// ─────────────────────────────────────────────────────────────────────────────
export { formatRupiah, formatRupiahFull } from '../app/data/mockData';
