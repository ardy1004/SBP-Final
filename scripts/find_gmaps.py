import json, re

with open(r'G:\A.DataWeb\SBP-Backup\SBP-Blueprint-18\Mobile Friendly Website\scripts\deskripsi_backup.json', encoding='utf-8-sig') as f:
    data = json.load(f)

results = data[0]['results']
print('Total rows:', len(results))

# Cari semua pola URL Google Maps
gmaps_pat = re.compile(
    r'https?://(?:maps\.app\.goo\.gl|goo\.gl/maps|www\.google\.com/maps|'
    r'maps\.google\.com|maps\.app\.goo\.gl)[^\s,\)"\']+'
)

found = []
for r in results:
    desc = r.get('deskripsi') or ''
    urls = gmaps_pat.findall(desc)
    if urls:
        found.append({'id': r['id'], 'urls': urls})

print('Properties with gmaps URL in deskripsi:', len(found))
for item in found[:10]:
    print(f"  id={item['id']}: {item['urls']}")

# Juga cari pola koordinat langsung (@lat,lng)
coord_pat = re.compile(r'@(-?\d+\.\d+),(-?\d+\.\d+)')
with_coords = []
for r in results:
    desc = r.get('deskripsi') or ''
    matches = coord_pat.findall(desc)
    if matches:
        with_coords.append({'id': r['id'], 'coords': matches})

print('\nProperties with @lat,lng in deskripsi:', len(with_coords))
for item in with_coords[:5]:
    print(f"  id={item['id']}: {item['coords']}")
