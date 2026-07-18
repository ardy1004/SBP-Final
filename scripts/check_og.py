import urllib.request, re

bot_ua = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'

def check(label, url):
    req = urllib.request.Request(url, headers={'User-Agent': bot_ua})
    with urllib.request.urlopen(req, timeout=15) as r:
        html = r.read().decode('utf-8', errors='replace')
    tags = re.findall(r'<meta[^>]+(?:og:image)[^>]*content="([^"]+)"[^>]*/>', html)
    tags += re.findall(r'<meta[^>]+content="([^"]+)"[^>]+og:image[^>]*/>', html)
    print(f'\n=== {label} ===')
    for t in tags:
        print(f'  og:image: {t}')
    if not tags:
        print('  (no og:image tag found)')

check('HOMEPAGE', 'https://salambumi.xyz/')
check('ABOUT', 'https://salambumi.xyz/about')
check('PROPERTI DETAIL',
      'https://salambumi.xyz/dijual/kost/di-yogyakarta/kabupaten-sleman/depok/'
      'kost-eksklusif-16-kamar-ruang-usaha-di-jl-aspal-lebar-dekat-ambarukmo-plaza-354e63')
