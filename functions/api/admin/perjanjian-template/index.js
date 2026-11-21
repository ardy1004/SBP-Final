// GET  /api/admin/perjanjian-template          — template aktif + riwayat versi.
// GET  /api/admin/perjanjian-template?versi=N  — blok satu versi (untuk dimuat ulang ke editor).
// POST /api/admin/perjanjian-template          — simpan sebagai versi BARU.
//      Body: { blok: [{ judul, isi, berlaku: { listing: [...], tujuan: [...] } }], catatan? }
//
// Tahap C3 (2026-11-21, migrasi 0065). Template = sumber salinan pasal yang
// dibekukan configure.js ke perjanjian BARU. Menyimpan tidak pernah menimpa:
// perjanjian yang sudah membekukan salinan tidak tersentuh, dan riwayat tetap
// bisa dibuka kembali. Versi 1 = TEMPLATE_V1 di kode (functions/_lib/teksPerjanjian.js).
// Auth: functions/api/admin/_middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { TEMPLATE_V1, PLACEHOLDER, DATA_CONTOH, templateAktif, validasiTemplate } from '../../../_lib/teksPerjanjian.js';

const V1_RIWAYAT = { versi: 1, catatan: 'Template bawaan (teks perjanjian sebelum editor)', dibuat_oleh: 'sistem', dibuat_at: null };

async function riwayat(env) {
  try {
    const r = await env.DB.prepare('SELECT versi, catatan, dibuat_oleh, dibuat_at FROM perjanjian_template ORDER BY versi DESC').all();
    return [...(r.results ?? []), V1_RIWAYAT];
  } catch (err) {
    if (/no such table/i.test(err?.message ?? '')) return [V1_RIWAYAT];
    throw err;
  }
}

export async function onRequestGet({ env, request }) {
  const versiMinta = parseInt(new URL(request.url).searchParams.get('versi') ?? '', 10);
  try {
    if (Number.isInteger(versiMinta)) {
      if (versiMinta === 1) return jsonOk({ versi: 1, blok: TEMPLATE_V1.blok });
      const row = await env.DB.prepare('SELECT versi, blok_json FROM perjanjian_template WHERE versi = ?').bind(versiMinta).first();
      if (!row) return jsonError('Versi template tidak ditemukan', 404);
      return jsonOk({ versi: row.versi, blok: JSON.parse(row.blok_json) });
    }
    const aktif = await templateAktif(env);
    return jsonOk({ aktif, riwayat: await riwayat(env), placeholder: PLACEHOLDER, data_contoh: DATA_CONTOH });
  } catch (err) {
    console.error('[perjanjian-template GET]', err.message);
    return jsonError(`Gagal memuat template: ${err.message}`, 500);
  }
}

export async function onRequestPost({ env, request, data }) {
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }
  const v = validasiTemplate(body?.blok);
  if (v.galat) return jsonError(v.galat, 422);
  const catatan = String(body?.catatan ?? '').trim().slice(0, 300) || null;
  const oleh = String(data?.admin?.nama || data?.admin?.email || `admin#${data?.admin?.sub ?? '?'}`).slice(0, 120);
  try {
    // Versi berikutnya dihitung di SQL yang sama dengan INSERT; UNIQUE(versi)
    // menolak tabrakan dua penyimpanan bersamaan (yang kalah mendapat 409).
    await env.DB.prepare(
      `INSERT INTO perjanjian_template (versi, blok_json, catatan, dibuat_oleh)
       VALUES ((SELECT COALESCE(MAX(versi), 1) + 1 FROM perjanjian_template), ?, ?, ?)`
    ).bind(JSON.stringify(v.blok), catatan, oleh).run();
  } catch (err) {
    if (/UNIQUE/i.test(err?.message ?? '')) return jsonError('Template baru saja disimpan dari tempat lain — muat ulang lalu simpan lagi', 409);
    if (/no such table/i.test(err?.message ?? '')) return jsonError('Template belum tersedia: migrasi database 0065 belum diterapkan.', 503);
    console.error('[perjanjian-template POST]', err.message);
    return jsonError('Gagal menyimpan template', 500);
  }
  return jsonOk({ aktif: await templateAktif(env), riwayat: await riwayat(env), placeholder: PLACEHOLDER, data_contoh: DATA_CONTOH }, 201);
}

export async function onRequestOptions() { return handleOptions(); }
