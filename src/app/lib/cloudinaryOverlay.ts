// Compose Cloudinary video overlay transformation URLs — dipakai untuk
// menempelkan badge status (Sold/Premium/Featured/Hot/Pilihan) dan logo
// watermark ke video ViralFrame, secara on-the-fly (bukan render ulang
// manual). Dipakai di halaman Pengaturan (live preview) dan Konten Agent.

export type BadgeType = 'sold' | 'premium' | 'featured' | 'hot' | 'pilihan' | 'logo';
export type BadgeGravity = 'north_west' | 'north_east' | 'south_west' | 'south_east' | 'center';

export interface BadgeAsset {
  id: number;
  type: BadgeType;
  cloudinary_public_id: string;
  cloudinary_url: string;
  gravity: BadgeGravity;
  offset_x: number;
  offset_y: number;
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
  return `l_${id},g_${asset.gravity},x_${asset.offset_x},y_${asset.offset_y},w_${asset.width_pct},fl_relative/fl_layer_apply`;
}

// Sisipkan transformasi overlay tepat setelah "/upload/" pada secure_url Cloudinary.
export function buildOverlayVideoUrl(baseUrl: string, assets: BadgeAsset[]): string {
  if (!baseUrl || assets.length === 0) return baseUrl;
  const marker = '/upload/';
  const idx = baseUrl.indexOf(marker);
  if (idx === -1) return baseUrl;
  const insertAt = idx + marker.length;
  const transforms = assets.map(overlaySegment).join('/');
  return baseUrl.slice(0, insertAt) + transforms + '/' + baseUrl.slice(insertAt);
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
