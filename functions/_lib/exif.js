// Strip EXIF APP1 segment from JPEG bytes (removes GPS and camera metadata).
// Non-JPEG input (PNG, WebP) is returned unchanged.
// Output is always a valid image — if parsing fails partway, we fall back to the original.
export function stripExif(bytes) {
  if (!(bytes instanceof Uint8Array)) return bytes;
  // JPEG starts with SOI: 0xFF 0xD8
  if (bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return bytes;

  const parts = [bytes.slice(0, 2)]; // SOI
  let i = 2;

  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xFF) {
      // Malformed marker — copy remainder as-is to keep image valid
      parts.push(bytes.slice(i));
      break;
    }

    const marker = bytes[i + 1];

    // SOS (Start Of Scan, 0xDA) — everything after is compressed bitstream
    if (marker === 0xDA) {
      parts.push(bytes.slice(i));
      break;
    }

    // EOI (End Of Image, 0xD9)
    if (marker === 0xD9) {
      parts.push(bytes.slice(i, i + 2));
      break;
    }

    // Standalone 2-byte markers (no length field): RST0–RST7, SOI
    if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD7)) {
      parts.push(bytes.slice(i, i + 2));
      i += 2;
      continue;
    }

    // Segment with a 2-byte length field (length value includes the 2 length bytes)
    if (i + 3 >= bytes.length) { parts.push(bytes.slice(i)); break; }
    const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
    const segEnd = i + 2 + segLen;
    if (segEnd > bytes.length) { parts.push(bytes.slice(i)); break; }

    // APP1 (0xE1) with "Exif\0\0" signature — drop this segment (GPS lives here)
    if (marker === 0xE1 && segLen >= 8) {
      const s = bytes;
      const base = i + 4;
      if (s[base]   === 0x45 && s[base+1] === 0x78 && s[base+2] === 0x69 &&
          s[base+3] === 0x66 && s[base+4] === 0x00 && s[base+5] === 0x00) {
        i = segEnd;
        continue; // skip EXIF segment
      }
    }

    parts.push(bytes.slice(i, segEnd));
    i = segEnd;
  }

  const totalLen = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
