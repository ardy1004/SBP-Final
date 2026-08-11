// Compose Cloudinary video overlay transformation URLs — dipakai untuk
// menempelkan badge status (Sold/Premium/Featured/Hot/Pilihan) dan logo
// watermark ke video ViralFrame, secara on-the-fly (bukan render ulang
// manual). Dipakai di halaman Pengaturan (live preview) dan Konten Agent.

export type BadgeType = 'sold' | 'premium' | 'featured' | 'hot' | 'pilihan' | 'logo';

export interface BadgeAsset {
  id: number;
  character_id: number;
  type: BadgeType;
  cloudinary_public_id: string;
  cloudinary_url: string;
  // Cloud tempat file badge ini tersimpan (migrasi 0037). Sejak tiap agent bisa
  // punya akun Cloudinary sendiri, badge dari cloud LAIN tidak bisa dipakai
  // sebagai overlay — lihat buildOverlayVideoUrl. Null = baris lama.
  cloudinary_name?: string | null;
  // Posisi bebas (persentase 0-1 dari pojok kiri-atas video) — bisa di titik mana pun,
  // bukan cuma preset gravity. Diatur lewat drag langsung di preview (BadgeLogoSettings).
  x_pct: number;
  y_pct: number;
  width_pct: number;
}

export interface PropertyBadgeFlags {
  status_sold?: number | boolean | null;
  badge_premium?: number | boolean | null;
  badge_featured?: number | boolean | null;
  badge_hot?: number | boolean | null;
  properti_pilihan?: number | boolean | null;
}

// Prioritas kalau beberapa badge status berlaku sekaligus — hanya 1 yang tampil.
const STATUS_PRIORITY: BadgeType[] = ['sold', 'premium', 'featured', 'hot', 'pilihan'];

export function pickStatusBadgeType(flags: PropertyBadgeFlags): BadgeType | null {
  const active: Record<string, boolean> = {
    sold: !!flags.status_sold,
    premium: !!flags.badge_premium,
    featured: !!flags.badge_featured,
    hot: !!flags.badge_hot,
    pilihan: !!flags.properti_pilihan,
  };
  for (const t of STATUS_PRIORITY) if (active[t]) return t;
  return null;
}

function overlaySegment(asset: BadgeAsset): string {
  const id = asset.cloudinary_public_id.replace(/\//g, ':');
  // PENTING (bug yang sudah diperbaiki): g_/x_/y_ (posisi) HARUS ada di segmen
  // fl_layer_apply, BUKAN di segmen "l_" (segmen "l_" cuma untuk resize/crop
  // overlay itu sendiri — g_ di situ dibaca sbg crop-gravity, bukan penempatan,
  // dan diam-diam diabaikan Cloudinary sehingga overlay selalu jatuh ke tengah
  // & ukuran aslinya). c_scale wajib disertakan supaya w_ relatif benar2 dipakai
  // untuk resize (tanpa itu w_ juga diabaikan, overlay tampil ukuran asli upload).
  // e_trim: banyak file badge/logo diekspor dengan padding transparan di
  // sekeliling gambar (kanvas persegi tapi isinya cuma mengisi bagian tengah)
  // — tanpa trim, width_pct% yang di-drag sebagian besar berisi area kosong,
  // jadi ukuran/posisi tampak "tidak menutup" target padahal sudah sesuai
  // kotak yang di-drag. e_trim memangkas padding itu otomatis sebelum discale.
  return `l_${id},e_trim,w_${asset.width_pct},c_scale,fl_relative/fl_layer_apply,g_north_west,x_${asset.x_pct},y_${asset.y_pct},fl_relative`;
}

// Versi trimmed dari gambar badge/logo (image resource) — dipakai di preview
// editor supaya WYSIWYG dengan hasil akhir video (yang juga di-trim via e_trim).
export function toTrimmedImageUrl(imageUrl: string): string {
  const marker = '/upload/';
  const idx = imageUrl.indexOf(marker);
  if (idx === -1) return imageUrl;
  const insertAt = idx + marker.length;
  return imageUrl.slice(0, insertAt) + 'e_trim/' + imageUrl.slice(insertAt);
}

export function cloudNameDariUrl(url: string): string | null {
  const m = /^https:\/\/res\.cloudinary\.com\/([^/]+)\//.exec(url ?? '');
  return m ? m[1] : null;
}

// Badge yang BISA dipakai sebagai overlay untuk video ini: l_<public_id> hanya
// menemukan aset di cloud yang sama dengan videonya. Sejak tiap agent punya
// akun Cloudinary sendiri (migrasi 0037), badge dari cloud lain WAJIB dibuang
// di sini — kalau tidak, URL yang dihasilkan ditolak Cloudinary dan videonya
// gagal tampil sama sekali (bukan sekadar tampil tanpa badge).
// Baris lama tanpa cloudinary_name dianggap cocok — sebelum 0037 semuanya
// memang berada di satu cloud yang sama.
export function badgeSecloud(baseUrl: string, assets: BadgeAsset[]): BadgeAsset[] {
  const cloud = cloudNameDariUrl(baseUrl);
  if (!cloud) return assets;
  return assets.filter(a => !a.cloudinary_name || a.cloudinary_name === cloud);
}

// Sisipkan transformasi overlay tepat setelah "/upload/" pada secure_url Cloudinary.
export function buildOverlayVideoUrl(baseUrl: string, assets: BadgeAsset[]): string {
  if (!baseUrl || assets.length === 0) return baseUrl;
  const marker = '/upload/';
  const idx = baseUrl.indexOf(marker);
  if (idx === -1) return baseUrl;
  const dipakai = badgeSecloud(baseUrl, assets);
  if (dipakai.length === 0) return baseUrl;
  const insertAt = idx + marker.length;
  const transforms = dipakai.map(overlaySegment).join('/');
  return baseUrl.slice(0, insertAt) + transforms + '/' + baseUrl.slice(insertAt);
}

// Sisipkan fl_attachment supaya browser men-download file alih-alih memutarnya —
// atribut `download` pada <a> diabaikan untuk URL cross-origin (Cloudinary),
// jadi pemaksaan attachment harus dari sisi server Cloudinary via transformasi ini.
export function toAttachmentUrl(url: string): string {
  const marker = '/upload/';
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const insertAt = idx + marker.length;
  return url.slice(0, insertAt) + 'fl_attachment/' + url.slice(insertAt);
}

// Ganti ekstensi video jadi .jpg — Cloudinary otomatis render 1 frame video jadi
// gambar statis. Dipakai untuk preview posisi badge/logo yang ringan (bukan
// <video autoplay>), karena overlay-nya statis dan tidak butuh gerakan.
export function toImageThumbnailUrl(videoUrl: string): string {
  return videoUrl.replace(/\.(mp4|mov|webm|mkv|avi)(\?.*)?$/i, '.jpg$2');
}

// Pilih overlay yang berlaku untuk 1 properti: 1 badge status (prioritas tertinggi) + logo (selalu, jika ada).
export function composeOverlaysForProperty(
  byType: Partial<Record<BadgeType, BadgeAsset>>,
  flags: PropertyBadgeFlags
): BadgeAsset[] {
  const result: BadgeAsset[] = [];
  const statusType = pickStatusBadgeType(flags);
  if (statusType && byType[statusType]) result.push(byType[statusType]!);
  if (byType.logo) result.push(byType.logo);
  return result;
}
