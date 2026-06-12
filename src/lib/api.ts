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
  jumlah_kamar_tidur: number | null;
  jumlah_kamar_mandi: number | null;
  luas_tanah: number | null;
  luas_bangunan: number | null;
  lebar_depan: number | null;
  lantai: number | null;
  legalitas: string;
  status_legalitas: string | null;
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
  images_raw: string | null;  // GROUP_CONCAT url_webp dipisah '|||' (maks 5) — untuk slider card
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
  // field tambahan yang mungkin ada di detail
  status_legalitas?: string | null;
  video_youtube?: string | null;
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
}

export interface ApiLeadResponse {
  lead_id: number;
  wa_url: string;
  wa_pesan: string;
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
  };
}

export type NormalizedProperty = ReturnType<typeof normalizeProperty>;

/** Konversi ApiPropertyDetail → format detail yang dipakai halaman detail */
export function normalizePropertyDetail(p: ApiPropertyDetail) {
  const base = normalizeProperty(p);
  return {
    ...base,
    deskripsi: p.deskripsi ?? '',
    kelurahan: '',
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
