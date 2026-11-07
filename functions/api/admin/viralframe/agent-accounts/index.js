// GET /api/admin/viralframe/agent-accounts — kredensial storage & scheduler
// tiap agent (viralframe_characters LEFT JOIN viralframe_agent_accounts).
// Rahasia (api_secret, key Buffer/Zernio) hanya dikirim TER-MASK; nilai penuh
// tidak pernah keluar dari server. cloudinary_api_key ditampilkan apa adanya —
// nilai itu memang sudah dikirim ke browser tiap kali signed upload dibuat.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../_shared/response.js';
import { maskKey } from '../../../../_lib/aiProviders.js';
import { parseSpesialis, parseChannels, getModeAkun, PLATFORMS } from '../../../../_lib/agentAccounts.js';
import { setSetting, getSetting } from '../../../../_lib/schedulerProviders.js';
import { kuotaAkun, kuotaRamp, PRESET_UTAMA_DEFAULT } from '../../../../_lib/jadwalOtomatis.js';
import { susunJamSemuaAgent } from '../../../../_lib/susunJam.js';

export async function onRequestGet({ env }) {
  try {
    const res = await env.DB.prepare(`
      SELECT c.id AS character_id, c.nama,
             a.gmail, a.spesialis, a.cloudinary_name, a.cloudinary_api_key, a.cloudinary_api_secret,
             a.buffer_api_key, a.zernio_api_key, a.channels_json,
             a.jam_auto, a.auto_aktif, a.mulai_aktif, a.auto_terakhir, a.auto_hasil,
             (SELECT COUNT(*) FROM viralframe_agent_videos v WHERE v.character_id = c.id AND v.trashed_at IS NULL) AS video_aktif
      FROM viralframe_characters c
      LEFT JOIN viralframe_agent_accounts a ON a.character_id = c.id
      ORDER BY c.id
    `).all();

    const { utama } = await getModeAkun(env);
    const items = await Promise.all((res.results ?? []).map(async r => ({
      character_id: r.character_id,
      nama: r.nama,
      gmail: r.gmail ?? '',
      spesialis: parseSpesialis(r.spesialis),
      cloudinary_name: r.cloudinary_name ?? '',
      cloudinary_api_key: r.cloudinary_api_key ?? '',
      cloudinary_api_secret_masked: maskKey(r.cloudinary_api_secret),
      buffer_api_key_masked: maskKey(r.buffer_api_key),
      zernio_api_key_masked: maskKey(r.zernio_api_key),
      channels: parseChannels(r.channels_json),
      // Ringkasan kesiapan — dipakai badge status di UI supaya agent yang belum
      // lengkap (mis. Vina) kelihatan sebelum dipakai, bukan setelah gagal.
      storage_siap: !!(r.cloudinary_name && r.cloudinary_api_key && r.cloudinary_api_secret),
      // "Siap" = ada key DAN ada channel. Key saja tidak cukup: fan-out tanpa
      // channel menghasilkan nol baris, yang dulu terbaca seperti sukses.
      scheduler_siap: !!(r.buffer_api_key || r.zernio_api_key) && Object.keys(parseChannels(r.channels_json)).length > 0,
      video_aktif: r.video_aktif ?? 0,
      jam_auto: r.jam_auto ?? '',
      auto_aktif: r.auto_aktif === 1,
      mulai_aktif: r.mulai_aktif ?? null,
      auto_terakhir: r.auto_terakhir ?? null,
      // Ringkasan cron terakhir. Data lama/rusak tidak boleh meledakkan UI.
      auto_hasil: (() => { try { return r.auto_hasil ? JSON.parse(r.auto_hasil) : null; } catch { return null; } })(),
      // Satu sumber dengan cron: mode & jam manual dibaca lewat kuotaAkun,
      // bukan dari kolom mentah — JSON rusak tampil sebagai "otomatis", persis
      // seperti yang benar-benar dijalankan mesin.
      ...(await kuotaAkun(env, r.character_id, utama).then(k => ({
        kuota: k.kuota,
        hari: k.hari,
        utama: k.utama,
        mode_jadwal: k.mode,
        jadwal_manual: k.mode === 'manual' ? k.preset : null,
        // Kuota yang AKAN berlaku bila agent ini memakai mode Otomatis — untuk
        // label pilihan di UI, supaya rumus ramp tidak ditulis ulang di browser.
        kuota_otomatis: k.hari != null ? kuotaRamp(k.hari) : null,
      }))),
    })));

    return jsonOk({
      items,
      ...(await getModeAkun(env)),
      auto_aktif: (await getSetting(env, 'viralframe_auto_aktif')) === '1',
      auto_terakhir: await getSetting(env, 'viralframe_auto_terakhir'),
    });
  } catch (err) {
    console.error('[vf agent-accounts] GET', err.message);
    return jsonError('Gagal memuat akun agent', 500);
  }
}

// PATCH /api/admin/viralframe/agent-accounts — mode akun global.
//   { mode?: 'terpusat'|'per_agent', utama?: number }
// Sengaja menumpang di endpoint koleksi, bukan file endpoint baru: anggaran
// bundle Functions sudah mepet dan ini cuma dua baris setting.
export async function onRequestPatch({ env, request }) {
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }

  const ops = [];
  if (body.mode === 'terpusat' || body.mode === 'per_agent') {
    ops.push(setSetting(env, 'viralframe_akun_mode', body.mode));
  }
  if ('auto_aktif' in body) {
    ops.push(setSetting(env, 'viralframe_auto_aktif', body.auto_aktif ? '1' : '0'));
  }
  if ('utama' in body) {
    const id = parseInt(body.utama, 10);
    if (!Number.isInteger(id) || id <= 0) return jsonError('utama harus id agent yang valid', 422);
    const ada = await env.DB.prepare('SELECT id FROM viralframe_characters WHERE id = ?').bind(id).first().catch(() => null);
    if (!ada) return jsonError('Agent utama tidak ditemukan', 404);

    // Endpoint ini belum pernah dipanggil UI mana pun (satu-satunya jalur
    // memindah agent utama sekarang) — kalau dipanggil langsung (mis. lewat API
    // tool) tanpa peringatan, preset jam posting (5-slot) & kuota dinamisnya
    // ikut pindah diam-diam ke agent baru, karena keduanya dihitung murni dari
    // `akunId === akunUtamaId`, bukan milik agent tertentu (audit 2026-08-15).
    const { utama: utamaSekarang } = await getModeAkun(env);
    if (utamaSekarang && utamaSekarang !== id && body.confirm !== true) {
      const [presetTersimpan, videoRow] = await Promise.all([
        getSetting(env, 'viralframe_preset_utama'),
        env.DB.prepare('SELECT COUNT(*) AS n FROM viralframe_agent_videos WHERE character_id = ? AND trashed_at IS NULL').bind(utamaSekarang).first().catch(() => null),
      ]);
      if (presetTersimpan || (videoRow?.n ?? 0) > 0) {
        return jsonError('Memindahkan agent utama akan ikut memindahkan preset jam posting (5-slot) dan kuota dinamisnya ke agent baru. Kirim ulang dengan { "confirm": true } untuk melanjutkan.', 422);
      }
    }
    ops.push(setSetting(env, 'viralframe_akun_utama', String(id)));
  }
  if (ops.length === 0) return jsonError('Tidak ada yang diubah', 400);

  try {
    await Promise.all(ops);
    return jsonOk({ ...(await getModeAkun(env)), auto_aktif: (await getSetting(env, 'viralframe_auto_aktif')) === '1' });
  } catch (err) {
    console.error('[vf agent-accounts] PATCH mode', err.message);
    return jsonError('Gagal menyimpan mode akun', 500);
  }
}

// POST /api/admin/viralframe/agent-accounts — aksi massal atas semua agent.
//   { aksi: 'susun_jam', variasi?: number, terapkan?: boolean }
// "Susun jam semua agent" (2026-11-07): menyusun ulang jam tayang agent utama
// + semua agent mode Manual supaya tidak ada dua akun tayang di menit yang sama
// (aturannya di functions/_lib/susunJam.js). terapkan:false = pratinjau saja.
// Ditumpangkan di endpoint koleksi, bukan file baru — pola yang sama dengan
// PATCH di atas (anggaran bundle Functions).
//
// ⚠️ Jam TIDAK PERNAH diterima dari klien. Saat diterapkan, susunan dihitung
// ulang di server dari data saat itu dengan `variasi` yang sama — karena
// fungsinya deterministik, hasilnya identik dengan pratinjau selama data agent
// tidak berubah di antaranya.
export async function onRequestPost({ env, request }) {
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }
  if (body?.aksi !== 'susun_jam') return jsonError('Aksi tidak dikenal', 400);

  const variasi = Number.isInteger(body.variasi) && body.variasi >= 0 && body.variasi < 1e6 ? body.variasi : 0;
  const terapkan = body.terapkan === true;

  try {
    const { mode, utama } = await getModeAkun(env);
    if (mode === 'terpusat') {
      return jsonError('Susun jam hanya berlaku di mode Per agent — di mode Terpusat semua agent memakai akun dan jam agent utama.', 422);
    }

    const res = await env.DB.prepare('SELECT id, nama FROM viralframe_characters ORDER BY id').all();
    const peserta = [];
    const tidakIkut = [];
    // Interval SATU untuk semua peserta (lihat susunJam.js): diambil dari agent
    // utama, karena itulah preset yang paling lama dipakai & dipilih user.
    let intervalMenit = null;
    for (const r of res.results ?? []) {
      // kuotaAkun = sumber yang sama dengan cron & tombol Jadwalkan, jadi
      // "siapa yang manual" di sini mustahil berbeda dari yang dijalankan mesin.
      const k = await kuotaAkun(env, r.id, utama);
      if (k.mode === 'otomatis') { tidakIkut.push({ id: r.id, nama: r.nama, alasan: 'mode Otomatis — jam diundi di jendela primetime' }); continue; }
      if (k.mode === 'utama') intervalMenit = k.preset.intervalMenit;
      peserta.push({ id: r.id, nama: r.nama, jumlah: k.preset.slots.length, utama: k.mode === 'utama', slotsLama: k.preset.slots });
    }
    // Tanpa agent utama di daftar peserta: pakai interval bawaan preset (5).
    intervalMenit ??= PRESET_UTAMA_DEFAULT.intervalMenit;

    const hasil = susunJamSemuaAgent({ peserta, intervalMenit, jumlahPlatform: PLATFORMS.length, variasi });
    if (!hasil.ok) return jsonError(hasil.pesan, 422);

    const info = new Map(peserta.map(p => [p.id, p]));
    const rencana = hasil.rencana.map(r => ({ ...r, utama: info.get(r.id).utama, slots_lama: info.get(r.id).slotsLama }));

    if (terapkan) {
      // Satu batch = satu transaksi: semua agent pindah ke susunan baru
      // bersamaan, atau tidak sama sekali. Setengah jalan berarti sebagian
      // akun masih memakai jam lama yang bertabrakan dengan susunan baru.
      const stmts = rencana.map(r => {
        const nilai = JSON.stringify({ slots: r.slots, intervalMenit });
        return r.utama
          ? env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind('viralframe_preset_utama', nilai)
          : env.DB.prepare("UPDATE viralframe_agent_accounts SET jadwal_manual = ?, updated_at = datetime('now') WHERE character_id = ?").bind(nilai, r.id);
      });
      await env.DB.batch(stmts);
    }

    return jsonOk({
      diterapkan: terapkan,
      variasi,
      interval_menit: intervalMenit,
      jarak_menit: hasil.jarakMenit,
      gelombang: hasil.gelombang,
      rencana,
      tidak_ikut: tidakIkut,
    });
  } catch (err) {
    console.error('[vf agent-accounts] POST susun_jam', err.message);
    return jsonError('Gagal menyusun jam agent', 500);
  }
}

export async function onRequestOptions() { return handleOptions(); }
