// POST /api/admin/viralframe/agent-accounts/:id/copy-badges
// Salin badge/logo agent ini ke cloud Cloudinary MILIKNYA SENDIRI.
//
// Kenapa perlu: overlay video Cloudinary (l_<public_id>, lihat
// src/app/lib/cloudinaryOverlay.ts) hanya bisa merujuk aset yang berada di
// cloud yang SAMA dengan videonya. Begitu satu agent pindah ke akun sendiri,
// badge lamanya tertinggal di cloud lama dan overlay-nya tidak bisa dipakai
// lagi. Frontend sudah melewati badge beda-cloud supaya tidak menghasilkan URL
// rusak; endpoint ini yang membereskannya betulan.
//
// Cloudinary mengunduh sendiri file sumbernya dari URL yang kita kirim
// (parameter `file` boleh berupa URL https), jadi bytes-nya TIDAK pernah lewat
// Worker — aman terhadap batas wall-clock 30 detik.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../../_shared/response.js';
import { sha1Hex, destroyByCloudName } from '../../../../../_lib/cloudinary.js';
import { resolveCloudinary } from '../../../../../_lib/agentAccounts.js';

export async function onRequestPost({ env, params }) {
  const characterId = parseInt(params.id, 10);
  if (!Number.isInteger(characterId) || characterId <= 0) return jsonError('id tidak valid', 400);

  const creds = await resolveCloudinary(env, characterId);
  if (!creds || creds.sumber !== 'agent') {
    return jsonError('Agent ini belum punya akun Cloudinary sendiri — simpan kredensialnya dulu', 422);
  }

  const res = await env.DB.prepare(
    `SELECT id, type, cloudinary_public_id, cloudinary_url, cloudinary_name FROM viralframe_badge_assets WHERE character_id = ?`
  ).bind(characterId).all().catch(() => null);
  const rows = (res?.results ?? []).filter(r => r.cloudinary_name !== creds.cloudName && r.cloudinary_url);
  if (rows.length === 0) return jsonOk({ disalin: 0, gagal: [], pesan: 'Semua badge sudah berada di cloud agent ini' });

  const folder = `sbp-viralframe/badges/${characterId}`;
  const disalin = [], gagal = [];

  for (const row of rows) {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await sha1Hex(`folder=${folder}&timestamp=${timestamp}` + creds.apiSecret);
      const form = new FormData();
      form.append('file', row.cloudinary_url);
      form.append('folder', folder);
      form.append('timestamp', String(timestamp));
      form.append('api_key', creds.apiKey);
      form.append('signature', signature);

      const up = await fetch(`https://api.cloudinary.com/v1_1/${creds.cloudName}/image/upload`, { method: 'POST', body: form });
      const json = await up.json().catch(() => null);
      if (!up.ok || !json?.public_id || !json?.secure_url) {
        gagal.push({ type: row.type, error: json?.error?.message ?? `HTTP ${up.status}` });
        continue;
      }
      await env.DB.prepare(
        `UPDATE viralframe_badge_assets
         SET cloudinary_public_id = ?, cloudinary_url = ?, cloudinary_name = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).bind(json.public_id, json.secure_url, creds.cloudName, row.id).run();
      disalin.push(row.type);

      // Salinan lama sudah tidak dirujuk baris mana pun (badge unik per
      // karakter+jenis, dan overlay dihitung dari baris ini saat render), jadi
      // aman dihapus. Penting: cloud asal umumnya akun global yang penyimpanannya
      // sudah hampir penuh — meninggalkannya di sana berarti bocor permanen.
      // Best-effort: gagal hapus TIDAK membatalkan penyalinan yang sudah sukses.
      if (row.cloudinary_public_id) {
        await destroyByCloudName(env, row.cloudinary_name, row.cloudinary_public_id, 'image')
          .catch(err => console.error('[copy-badges] hapus salinan lama', row.type, err.message));
      }
    } catch (err) {
      gagal.push({ type: row.type, error: err.message });
    }
  }

  return jsonOk({ disalin: disalin.length, jenis: disalin, gagal });
}

export async function onRequestOptions() { return handleOptions(); }
