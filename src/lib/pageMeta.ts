// Helper meta tag standar untuk halaman statis (SEO).
// React Router: meta leaf route MENGGANTIKAN meta root sepenuhnya (tidak merge),
// jadi helper ini mengembalikan set lengkap: title, description, canonical, OG, Twitter.

const BASE_URL = 'https://salambumi.xyz';
const SITE_OG_IMAGE = 'https://images.salambumi.xyz/salambumi.xyz.png';

interface PageMetaOpts {
  title: string;
  description: string;
  /** Path dimulai dengan '/', mis. '/about' */
  path: string;
  /** true → robots noindex (halaman placeholder/privat) */
  noindex?: boolean;
}

export function pageMeta({ title, description, path, noindex }: PageMetaOpts) {
  const url = `${BASE_URL}${path}`;
  return [
    { title },
    { name: 'description', content: description },
    { name: 'robots', content: noindex ? 'noindex, nofollow' : 'index, follow' },
    { tagName: 'link', rel: 'canonical', href: url },
    { property: 'og:site_name', content: 'Salam Bumi Property' },
    { property: 'og:type', content: 'website' },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
    { property: 'og:image', content: SITE_OG_IMAGE },
    { property: 'og:image:alt', content: 'Properti pilihan di Yogyakarta — Salam Bumi Property' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: SITE_OG_IMAGE },
  ];
}
