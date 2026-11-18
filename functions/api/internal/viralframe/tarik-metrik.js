// POST /api/internal/viralframe/tarik-metrik — tarik metrik post dari Buffer &
// Zernio untuk SATU agent per panggilan, bergiliran (2026-11-18).
//
// Dipanggil worker cron (workers/viralframe-purge-cron, pola "20 0-17 * * *"
// = tiap jam :20, 07:20–00:20 WIB) — 18 tick/hari untuk 8 agent, jadi tiap
// agent ±2× sehari. Buffer sendiri memperbarui metrik sekali sehari, jadi
// lebih sering tidak menambah apa-apa.
//
// ?character_id=N → paksa agent itu (dipakai backfill & pemeriksaan manual).
// ?dry=1          → tarik & cocokkan TANPA menulis: laporkan rasio cocok dan
//                   contoh metrik ternormalisasi. Dipakai sebelum menyalakan.
//
// Auth: header X-Purge-Secret == env.VIRALFRAME_PURGE_SECRET (pola sama dengan
// auto-schedule.js & purge-trash.js).

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';
import { getSetting, setSetting } from '../../../_lib/schedulerProviders.js';
import { resolveScheduler } from '../../../_lib/agentAccounts.js';
import { tarikBuffer, tarikZernio } from '../../../_lib/metrikProvider.js';
import { daftarkanPost, petaPostDikenal, cocokkan, pernyataanTulis } from '../../../_lib/metrikKonten.js';
import { tanggalWib } from '../../../_lib/waktu.js';
import { logServerError } from '../../../_lib/logError.js';

// Anggaran wall-clock, MENCADANGKAN biaya terburuk satu panggilan sebelum
// memulainya — pelajaran auto-schedule.js (2026-08-31).
const ANGGARAN_MS = 24000;
const TIMEOUT_PANGGILAN_MS = 9000;
const CADANGAN_EKOR_MS = 3000;   // pencocokan + tulis batch sesudah panggilan terakhir
const JENDELA_HARI = 35;          // > 30 hari: post yang dipurge pun sempat tertangkap snapshot D7-nya
const KUNCI_GILIRAN = 'viralframe_metrik_giliran';

export async function onRequestPost({ request, env }) {
  const secret = env.VIRALFRAME_PURGE_SECRET;
  if (!secret || request.headers.get('X-Purge-Secret') !== secret) return jsonError('Forbidden', 403);

  const mulai = Date.now();
  const bolehLanjut = () => Date.now() - mulai < ANGGARAN_MS - TIMEOUT_PANGGILAN_MS - CADANGAN_EKOR_MS;
  const url = new URL(request.url);
  const dry = url.searchParams.get('dry') === '1';
  const paksa = parseInt(url.searchParams.get('character_id') ?? '', 10);

  // Agent yang punya kredensial scheduler, urut id — giliran berputar.
  const daftar = (await env.DB.prepare(
    `SELECT c.id, c.nama FROM viralframe_characters c JOIN viralframe_agent_accounts a ON a.character_id = c.id
      WHERE a.buffer_api_key IS NOT NULL OR a.zernio_api_key IS NOT NULL ORDER BY c.id`
  ).all()).results ?? [];
  if (daftar.length === 0) return jsonOk({ dilewati: 'tidak ada agent berkredensial' });

  let agent;
  if (Number.isInteger(paksa) && paksa > 0) {
    agent = daftar.find(a => a.id === paksa);
    if (!agent) return jsonError('Agent tidak ditemukan atau belum punya kredensial scheduler', 404);
  } else {
    const terakhir = parseInt((await getSetting(env, KUNCI_GILIRAN)) ?? '', 10);
    agent = daftar.find(a => a.id > (Number.isInteger(terakhir) ? terakhir : 0)) ?? daftar[0];
    // Giliran ditulis DULU: kalau agent ini error berulang, tick berikutnya
    // tetap maju ke agent lain, bukan macet di satu agent selamanya.
    if (!dry) await setSetting(env, KUNCI_GILIRAN, String(agent.id));
  }

  const laporan = { agent: agent.nama, character_id: agent.id, dry };
  try {
    const akun = await resolveScheduler(env, agent.id);
    const akunId = akun.targetId;
    laporan.akun_id = akunId;

    if (!dry) laporan.daftar = await daftarkanPost(env, akunId);
    const peta = await petaPostDikenal(env, akunId, { dariJadwal: dry });
    laporan.post_dikenal = peta.size;

    const sejak = new Date(Date.now() - JENDELA_HARI * 86400000);
    const chBuffer = Object.values(akun.channels).filter(c => c.provider === 'buffer').map(c => c.id);
    const adaZernio = Object.values(akun.channels).some(c => c.provider === 'zernio');

    const b = await tarikBuffer({ apiKey: akun.bufferKey, channelIds: chBuffer, sejakIso: sejak.toISOString(), timeoutMs: TIMEOUT_PANGGILAN_MS, bolehLanjut });
    const z = adaZernio
      ? await tarikZernio({ apiKey: akun.zernioKey, dari: tanggalWib(sejak), sampai: tanggalWib(), timeoutMs: TIMEOUT_PANGGILAN_MS, bolehLanjut })
      : { items: [], galat: [], panggilan: 0, terpotong: false };

    const { hasil, takCocok } = cocokkan({ buffer: b.items, zernio: z.items }, peta);
    laporan.buffer = { post: b.items.length, panggilan: b.panggilan, terpotong: b.terpotong, galat: b.galat };
    laporan.zernio = { post: z.items.length, panggilan: z.panggilan, terpotong: z.terpotong, galat: z.galat };
    laporan.cocok = hasil.length;
    laporan.tak_cocok = takCocok;   // post di provider yang tidak ada di catatan kita (mis. baris 'Belum pasti' tanpa id)
    laporan.contoh = hasil.slice(0, 3).map(h => ({ provider: h.provider, remote_post_id: h.remote_post_id, ...h.n }));

    if (!dry && hasil.length > 0) {
      const stmts = hasil.map(h => pernyataanTulis(env, h));
      let ditulis = 0;
      for (let i = 0; i < stmts.length; i += 50) {
        const r = await env.DB.batch(stmts.slice(i, i + 50));
        ditulis += r.reduce((s, x) => s + (x.meta?.changes ?? 0), 0);
      }
      laporan.ditulis = ditulis;
    }

    const galat = [...b.galat.map(g => `Buffer ${g}`), ...z.galat.map(g => `Zernio ${g}`)];
    if (galat.length > 0 && !dry) {
      await logServerError(env, {
        source: 'server',
        message: `[metrik] penarikan ${agent.nama} sebagian gagal: ${galat.join(' | ').slice(0, 300)}`,
        url: '/api/internal/viralframe/tarik-metrik',
        context: { character_id: agent.id, akun_id: akunId, galat },
      });
    }
  } catch (err) {
    laporan.galat = err.message;
    console.error('[tarik-metrik]', agent.id, err.message);
    if (!dry) {
      await logServerError(env, {
        source: 'server',
        message: `[metrik] penarikan ${agent.nama} gagal: ${err.message}`,
        stack: err.stack,
        url: '/api/internal/viralframe/tarik-metrik',
        context: { character_id: agent.id },
      });
    }
  }

  laporan.durasi_ms = Date.now() - mulai;
  return jsonOk(laporan);
}

export async function onRequestOptions() { return handleOptions(); }
