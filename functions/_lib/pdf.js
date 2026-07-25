// PDF generator — perjanjian jasa pemasaran Salam Bumi Property
// Uses pdf-lib (pure JS, compatible with Cloudflare Workers runtime).
// Image fetches are best-effort: failures produce an empty slot, not an error.

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const TTD_ARDY_URL = 'https://images.salambumi.xyz/materai/gsd-removebg-preview%20-%20Copy.png';
const MATERAI_URL  = 'https://images.salambumi.xyz/materai/hg.png';

async function safeFetchPng(url) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'SBP-PDF-Generator/1.0', Accept: 'image/png,image/*' },
    });
    if (!r.ok) {
      console.warn(`[pdf] fetch ${url} → HTTP ${r.status}`);
      return null;
    }
    return new Uint8Array(await r.arrayBuffer());
  } catch (err) {
    console.warn(`[pdf] fetch ${url} gagal:`, err.message);
    return null;
  }
}

// WinAnsi (Windows-1252) covers U+0000-U+00FF plus a few at 0x80-0x9F.
// Replace anything outside that range with a safe ASCII fallback.
function toWinAnsi(s) {
  return String(s ?? '').replace(/[^\x00-\xFF]/g, c => {
    // Common substitutions
    if (c === '—' || c === '–') return '-';
    if (c === '‘' || c === '’') return "'";
    if (c === '“' || c === '”') return '"';
    if (c === '…') return '...';
    if (c === '≥') return '>=';
    if (c === '≤') return '<=';
    return '?';
  });
}

function wrapText(text, font, size, maxW) {
  const words = toWinAnsi(String(text ?? '')).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function fmtTanggal(iso) {
  try {
    // timeZone WAJIB: runtime Cloudflare selalu UTC, jadi tanpa ini penandatanganan
    // antara 00.00-07.00 WIB tercetak mundur satu hari pada dokumen perjanjian.
    // (2026-07-25T20:00:00Z = 26 Juli 03.00 WIB, dulu tercetak "25 Juli 2026".)
    return new Date(iso).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'long', year: 'numeric',
      timeZone: 'Asia/Jakarta',
    });
  } catch { return iso; }
}

function fmtDatetime(iso) {
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'Asia/Jakarta',
    });
  } catch { return iso; }
}

/**
 * Generate PDF perjanjian.
 * @param {object} p
 * @param {object}        p.agr           Agreement + owner + property fields
 * @param {string}        p.nikPlain       Decrypted NIK (or placeholder)
 * @param {string}        p.signedAt       ISO 8601 datetime
 * @param {string}        p.auditIp        IP address
 * @param {string}        p.auditHash      SHA-256 hex
 * @param {ArrayBuffer|null} p.ownerSigBytes Owner signature PNG from R2
 * @param {Array}         p.pasalList      [{pasal, judul, isi}]
 * @returns {Promise<Uint8Array>}
 */
export async function generateAgreementPDF({ agr, nikPlain, signedAt, auditIp, auditHash, ownerSigBytes, pasalList }) {
  const doc = await PDFDocument.create();
  const fB  = await doc.embedFont(StandardFonts.HelveticaBold);
  const fN  = await doc.embedFont(StandardFonts.Helvetica);

  // Fetch external images concurrently
  const [ttdArdyRaw, materaiRaw] = await Promise.all([
    safeFetchPng(TTD_ARDY_URL),
    safeFetchPng(MATERAI_URL),
  ]);

  let imgArdy = null, imgMaterai = null, imgOwner = null;
  if (ttdArdyRaw)   { try { imgArdy    = await doc.embedPng(ttdArdyRaw);  } catch (e) { console.error('[pdf] embed ardyTTD:', e.message); } }
  if (materaiRaw)   { try { imgMaterai = await doc.embedPng(materaiRaw);  } catch (e) { console.error('[pdf] embed materai:', e.message); } }
  if (ownerSigBytes){ try { imgOwner   = await doc.embedPng(ownerSigBytes instanceof ArrayBuffer ? new Uint8Array(ownerSigBytes) : ownerSigBytes); } catch (e) { console.error('[pdf] embed ownerSig:', e.message); } }

  console.info(`[pdf] images — ardyTTD:${imgArdy ? 'OK' : 'GAGAL'} materai:${imgMaterai ? 'OK' : 'GAGAL'} ownerSig:${imgOwner ? 'OK' : 'GAGAL'}`);

  // Page dimensions (A4 portrait in PDF points)
  const W = 595, H = 842;
  const ML = 50, MR = 50, MT = 50, MB = 50;
  const CW = W - ML - MR;         // 495

  let page = doc.addPage([W, H]);
  let y    = H - MT;              // start at top

  const C = {
    black: rgb(0, 0, 0),
    gray:  rgb(0.4, 0.4, 0.4),
    lgray: rgb(0.7, 0.7, 0.7),
    blue:  rgb(0.08, 0.39, 0.75),
  };

  // Ensure current y has room; add new page if not
  function ensurePage(need = 40) {
    if (y < MB + need) {
      page = doc.addPage([W, H]);
      y = H - MT;
    }
  }

  function drawRawText(str, xPos, yPos, { f = fN, sz = 9, col = C.black } = {}) {
    if (str == null) return;
    page.drawText(toWinAnsi(str), { x: xPos, y: yPos, font: f, size: sz, color: col });
  }

  // Draw single text line, advance y
  function drawLine(str, { f = fN, sz = 9, col = C.black, x = ML } = {}) {
    ensurePage(sz * 2);
    page.drawText(toWinAnsi(str), { x, y, font: f, size: sz, color: col });
    y -= sz * 1.6;
  }

  // Draw centered text, advance y
  function drawCenter(str, { f = fN, sz = 9, col = C.black } = {}) {
    ensurePage(sz * 2);
    const safe = toWinAnsi(str);
    const tw = f.widthOfTextAtSize(safe, sz);
    page.drawText(safe, { x: (W - tw) / 2, y, font: f, size: sz, color: col });
    y -= sz * 1.6;
  }

  // Draw word-wrapped paragraph, advance y
  function drawPara(str, { f = fN, sz = 9, col = C.black, x = ML, maxW = CW } = {}) {
    for (const l of wrapText(str, f, sz, maxW)) {
      ensurePage(sz * 2);
      page.drawText(l, { x, y, font: f, size: sz, color: col });
      y -= sz * 1.6;
    }
  }

  function drawHRule() {
    page.drawLine({ start: { x: ML, y }, end: { x: W - MR, y }, thickness: 0.5, color: C.lgray });
    y -= 10;
  }

  function gap(pts = 6) { y -= pts; }

  // ─── HEADER ─────────────────────────────────────────────────────────────────
  const jenisListingLabel = agr.jenis_listing === 'exclusive'
    ? `Exclusive${agr.durasi_kontrak ? ` — ${agr.durasi_kontrak} Bulan` : ''}`
    : 'Open (Tidak Terbatas)';
  const jenisTxLabel = agr.jenis_transaksi === 'sewa' ? 'Sewa Menyewa' : 'Jual Beli';

  drawCenter('PERJANJIAN JASA PEMASARAN — SALAM BUMI PROPERTY', { f: fB, sz: 13 });
  gap(2);
  drawCenter(`Jenis: ${jenisListingLabel}  ·  Jenis Perjanjian: ${jenisTxLabel}  ·  Nomor: ${agr.kode_perjanjian}`, { sz: 8, col: C.gray });
  drawCenter(`Tanggal: ${fmtTanggal(signedAt)}`, { sz: 8, col: C.gray });
  gap(4);
  drawHRule();

  // ─── PARA PIHAK (2 column) ───────────────────────────────────────────────
  const col1X = ML;
  const col2X = ML + CW / 2 + 10;
  const colW  = CW / 2 - 15;

  const pihakTop = y;
  let y1 = pihakTop, y2 = pihakTop;

  // Left — Pihak Pertama
  drawRawText('PIHAK PERTAMA — AGEN', col1X, y1, { f: fB, sz: 8, col: C.gray }); y1 -= 8 * 1.6;
  drawRawText('CV Salam Bumi Property', col1X, y1, { f: fB, sz: 9 }); y1 -= 9 * 1.6;
  for (const s of [
    'Jl. Pajajaran, Dabag, Condongcatur,',
    'Depok, Sleman, Daerah Istimewa Yogyakarta',
    'WA: 0813-9127-8889',
    'Email: salambumiproperty@gmail.com',
    'Website: salambumi.xyz',
  ]) { drawRawText(s, col1X, y1, { sz: 8, col: C.gray }); y1 -= 8 * 1.6; }

  // Right — Pihak Kedua
  const bertindak = agr.bertindak_sebagai === 'ahli_waris' ? 'Ahli Waris'
    : agr.bertindak_sebagai === 'kuasa' ? 'Pemegang Kuasa' : 'Pemilik Langsung';
  const alamatOwner = [
    agr.alamat_ktp,
    agr.rt_rw ? `RT/RW ${agr.rt_rw}` : null,
    agr.owner_kelurahan,
    agr.owner_kecamatan,
  ].filter(Boolean).join(', ');

  drawRawText('PIHAK KEDUA — PEMILIK', col2X, y2, { f: fB, sz: 8, col: C.gray }); y2 -= 8 * 1.6;
  drawRawText(agr.nama_ktp, col2X, y2, { f: fB, sz: 9 }); y2 -= 9 * 1.6;
  for (const s of [
    `NIK: ${nikPlain}`,
    `Alamat KTP: ${alamatOwner || '-'}`,
    `Bertindak sebagai: ${bertindak}`,
  ]) {
    for (const l of wrapText(s, fN, 8, colW)) {
      drawRawText(l, col2X, y2, { sz: 8, col: C.gray }); y2 -= 8 * 1.6;
    }
  }

  y = Math.min(y1, y2) - 8;
  drawHRule();

  // ─── PASAL 1-7 ────────────────────────────────────────────────────────────
  for (const p of pasalList) {
    ensurePage(50);
    drawLine(`Pasal ${p.pasal} — ${p.judul}`, { f: fB, sz: 9, col: C.blue });
    drawPara(p.isi, { sz: 9 });
    gap(4);
  }

  drawHRule();

  // ─── TANDA TANGAN ─────────────────────────────────────────────────────────
  ensurePage(180);
  const SIG_TOP  = y;
  const IMG_H    = 90;
  // Image slot starts below two label lines (each ~14pt)
  const IMG_Y    = SIG_TOP - 14 - 14 - IMG_H;
  const LINE_Y1  = IMG_Y - 6;
  const LINE_Y2  = IMG_Y - 6;

  // Left column - Pihak Pertama (Ardy)
  drawRawText('Pihak Pertama,',         col1X, SIG_TOP,      { sz: 9, col: C.gray });
  drawRawText('CV Salam Bumi Property', col1X, SIG_TOP - 14, { f: fB, sz: 9 });
  if (imgArdy) {
    const d = imgArdy.scaleToFit(colW, IMG_H);
    page.drawImage(imgArdy, { x: col1X + (colW - d.width) / 2, y: IMG_Y, width: d.width, height: d.height });
  } else {
    drawRawText('[TTD]', col1X + 10, IMG_Y + IMG_H / 2, { sz: 8, col: C.gray });
  }
  page.drawLine({ start: { x: col1X, y: LINE_Y1 }, end: { x: col1X + colW, y: LINE_Y1 }, thickness: 0.5, color: C.lgray });
  drawRawText('Ardy Salam',     col1X, LINE_Y1 - 14, { f: fB, sz: 9 });
  drawRawText('Agent Properti', col1X, LINE_Y1 - 26, { sz: 8, col: C.gray });

  // Right column - Pihak Kedua (materai + owner TTD)
  drawRawText('Pihak Kedua,', col2X, SIG_TOP, { sz: 9, col: C.gray });
  if (imgMaterai) {
    // Preserve aspect ratio at full slot height; materai drawn first (under owner TTD)
    const mH = IMG_H;
    const mW = mH * (imgMaterai.width / imgMaterai.height);
    page.drawImage(imgMaterai, {
      x: col2X + (colW - mW) / 2, y: IMG_Y,
      width: mW, height: mH, opacity: 0.9,
    });
  }
  if (imgOwner) {
    const d = imgOwner.scaleToFit(colW, IMG_H);
    page.drawImage(imgOwner, { x: col2X + (colW - d.width) / 2, y: IMG_Y, width: d.width, height: d.height });
  }
  if (!imgMaterai && !imgOwner) {
    drawRawText('[TTD Pemilik]', col2X + 10, IMG_Y + IMG_H / 2, { sz: 8, col: C.gray });
  }
  page.drawLine({ start: { x: col2X, y: LINE_Y2 }, end: { x: col2X + colW, y: LINE_Y2 }, thickness: 0.5, color: C.lgray });
  drawRawText(agr.nama_ktp,       col2X, LINE_Y2 - 14, { f: fB, sz: 9 });
  drawRawText('Pemilik Properti', col2X, LINE_Y2 - 26, { sz: 8, col: C.gray });

  y = Math.min(LINE_Y1, LINE_Y2) - 42;

  // ─── FOOTER AUDIT ─────────────────────────────────────────────────────────
  ensurePage(60);
  drawHRule();
  drawPara(
    `Ditandatangani secara elektronik pada ${fmtDatetime(signedAt)} WIB  ·  IP: ${auditIp}`,
    { sz: 7, col: C.gray },
  );
  drawPara(`Hash dokumen (SHA-256): ${auditHash}`, { sz: 7, col: C.gray });
  gap(3);
  drawPara(
    'Tanda tangan elektronik ini sah secara hukum sesuai UU ITE No. 11 Tahun 2008 dan perubahannya. Dokumen ini merupakan arsip digital yang terautentikasi oleh sistem Salam Bumi Property.',
    { sz: 7, col: C.gray },
  );

  return doc.save();
}
