// PUT /api/admin/viralframe/agent-accounts/:id — simpan kredensial 1 agent.
//   Body: field mana pun dari DAFTAR di bawah. Field yang TIDAK dikirim tidak
//   disentuh. String kosong = kosongkan. Nilai ber-'•' = itu tampilan masked
//   yang dikirim balik apa adanya oleh form → diabaikan (jangan menimpa
//   rahasia asli dengan bulatan-bulatan). Pola sama dengan settings/ai-keys.js.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../../_shared/response.js';
import { PLATFORMS } from '../../../../../_lib/agentAccounts.js';

// Sama persis dengan VALID_JENIS di functions/api/properties/index.js,
// _lib/searchProperties.js, api/chat.js dst — daftar ini memang didefinisikan
// ulang di tiap endpoint yang memvalidasinya (konvensi yang sudah ada di repo;
// src/lib/propertyTypes.ts adalah cerminnya untuk sisi frontend).
const VALID_JENIS = ['rumah','tanah','kost','hotel','homestay','villa','apartment','ruko','gudang','komersial'];

const FIELDS = [
  'gmail',
  'cloudinary_name', 'cloudinary_api_key', 'cloudinary_api_secret',
  'buffer_api_key', 'zernio_api_key',
  'jam_auto',
];

const JAM_RE = /^([01]\d|2[0-3]):(00|30)$/;

const PROVIDERS = ['buffer', 'zernio'];

export async function onRequestPut({ env, request, params }) {
  const characterId = parseInt(params.id, 10);
  if (!Number.isInteger(characterId) || characterId <= 0) return jsonError('id tidak valid', 400);

  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const karakter = await env.DB.prepare('SELECT id FROM viralframe_characters WHERE id = ?').bind(characterId).first().catch(() => null);
  if (!karakter) return jsonError('Agent tidak ditemukan', 404);

  const kolom = [], nilai = [];
  for (const f of FIELDS) {
    if (!(f in body)) continue;
    const raw = body[f];
    if (typeof raw === 'string' && raw.includes('•')) continue; // masked, biarkan nilai lama
    kolom.push(f);
    nilai.push(typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 300) : null);
  }

  // spesialis: array jenis_properti, disaring ke nilai yang benar-benar dikenal
  // sistem — kalau tidak, salah ketik ('Rumah' vs 'rumah') diam-diam membuat
  // agent tidak pernah cocok dengan properti mana pun.
  if ('spesialis' in body) {
    const arr = Array.isArray(body.spesialis) ? body.spesialis : [];
    const bersih = [...new Set(arr.filter(v => typeof v === 'string' && VALID_JENIS.includes(v)))];
    kolom.push('spesialis');
    nilai.push(JSON.stringify(bersih));
  }

  // Saklar auto per agent — terpisah dari saklar induk, supaya agent yang belum
  // siap (mis. belum punya kredensial) bisa dimatikan sendiri.
  if ('auto_aktif' in body) {
    kolom.push('auto_aktif');
    nilai.push(body.auto_aktif ? 1 : 0);
  }

  // Jam submit harus tepat di kelipatan 30 menit: cron menyala tiap :00 dan :30,
  // jadi jam seperti '01:17' tidak akan pernah cocok dan agent-nya diam selamanya.
  if (kolom.includes('jam_auto')) {
    const v = nilai[kolom.indexOf('jam_auto')];
    if (v && !JAM_RE.test(v)) return jsonError('jam_auto harus HH:00 atau HH:30 (cron menyala tiap 30 menit)', 422);
  }

  // channels: { "<platform>": { provider, id } }. Entri tanpa id dibuang —
  // platform yang tidak dipakai agent ini memang tidak boleh punya baris.
  if ('channels' in body) {
    const src = body.channels && typeof body.channels === 'object' ? body.channels : {};
    const bersih = {};
    for (const p of PLATFORMS) {
      const c = src[p];
      if (!c || typeof c !== 'object') continue;
      const id = typeof c.id === 'string' ? c.id.trim().slice(0, 200) : '';
      if (!id || !PROVIDERS.includes(c.provider)) continue;
      bersih[p] = { provider: c.provider, id };
    }
    kolom.push('channels_json');
    nilai.push(Object.keys(bersih).length > 0 ? JSON.stringify(bersih) : null);
  }

  if (kolom.length === 0) return jsonError('Tidak ada field yang diupdate', 400);

  const setSql = kolom.map(k => `${k} = ?`).join(', ');
  try {
    // INSERT dulu (baris agent mungkin belum pernah ada), lalu UPDATE field yang
    // dikirim saja. Dua langkah, bukan satu upsert bernilai penuh — supaya
    // menyimpan 1 field tidak menghapus field lain yang tidak ikut dikirim.
    await env.DB.prepare('INSERT OR IGNORE INTO viralframe_agent_accounts (character_id) VALUES (?)').bind(characterId).run();
    await env.DB.prepare(
      `UPDATE viralframe_agent_accounts SET ${setSql}, updated_at = datetime('now') WHERE character_id = ?`
    ).bind(...nilai, characterId).run();
    return jsonOk({ updated: kolom });
  } catch (err) {
    console.error('[vf agent-accounts] PUT', err.message);
    return jsonError('Gagal menyimpan kredensial agent', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
