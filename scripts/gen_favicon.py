import urllib.request, os
from PIL import Image

url = "https://images.salambumi.xyz/materai/fav.webp"
pub = r"G:\A.DataWeb\SBP-Backup\SBP-Blueprint-18\Mobile Friendly Website\public"
logo_path = os.path.join(pub, "_fav_source.webp")

print(f"Downloading {url} ...")
req = urllib.request.Request(url, headers={
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120",
    "Referer": "https://salambumi.xyz/",
})
with urllib.request.urlopen(req) as resp, open(logo_path, "wb") as f:
    f.write(resp.read())

src = Image.open(logo_path).convert("RGBA")
print(f"Source size: {src.size}")

def save_png(size, filename):
    img = src.resize((size, size), Image.LANCZOS)
    img.save(os.path.join(pub, filename), "PNG")
    print(f"  {filename} ({size}x{size})")

save_png(16,  "favicon-16x16.png")
save_png(32,  "favicon-32x32.png")
save_png(48,  "favicon-48x48.png")
save_png(180, "apple-touch-icon.png")
save_png(192, "android-chrome-192x192.png")
save_png(512, "android-chrome-512x512.png")

ico_sizes = [16, 32, 48]
ico_images = [src.resize((s, s), Image.LANCZOS) for s in ico_sizes]
ico_path = os.path.join(pub, "favicon.ico")
ico_images[0].save(ico_path, format="ICO", sizes=[(s, s) for s in ico_sizes])
print(f"  favicon.ico (16x16, 32x32, 48x48)")

os.remove(logo_path)
print("Done.")
