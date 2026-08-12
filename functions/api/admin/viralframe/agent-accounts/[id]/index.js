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

// Jam yang benar-benar dilalui cron: "0,30 18-21 UTC" = 01:00–04:30 WIB
// (workers/viralframe-purge-cron/wrangler.toml). Di luar rentang ini nilainya
// tersimpan rapi tapi agent-nya tidak akan pernah menyala — ditolak di sini
// supaya kegagalannya terlihat saat menyimpan, bukan berbulan-bulan kemudian.
const JAM_RE = /^(0[1-4]):(00|30)$/;

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

  // Jam submit harus tepat di kelipatan 30 menit DAN di dalam jendela cron:
  // jam seperti '01:17' atau '09:00' tidak akan pernah cocok, dan agent-nya
  // diam selamanya tanpa satu pun pesan error.
  if (kolom.includes('jam_auto')) {
    const v = nilai[kolom.indexOf('jam_auto')];
    if (v && !JAM_RE.test(v)) return jsonError('jam_auto harus antara 01:00–04:30 WIB, tepat di :00 atau :30 (di luar itu cron tidak pernah menyala)', 422);
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
