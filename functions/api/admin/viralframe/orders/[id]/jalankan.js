// POST /api/admin/viralframe/orders/:id/jalankan — majukan pesanan SATU stasiun.
//
// Ini ban berjalan pipeline. Satu panggilan = satu stasiun, bukan seluruh
// rantai — tiga alasan, semuanya keras:
//   1. Wall-clock Worker 30 detik. Rantai penuh (visi + panggilan AI) tidak muat.
//   2. Tiap stasiun harus bisa diulang SENDIRI saat gagal, tanpa mengulang yang beres.
//   3. Pesanan berhenti berjam-jam di `menunggu_render` (gerbang manusia di Google
//      Flow) — bentuk alaminya memang state machine, bukan satu proses panjang.
//
//   baru → material → variasi → storyboard → menunggu_render
//
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../../../_shared/response.js';
import { logServerError } from '../../../../../_lib/logError.js';
import { maksVariasi, entriSumbu, SUMBU_DOMINAN, FLOW, voDetikBaku } from '../../../../../_lib/viralframe.js';
import { pilihVariasi } from '../../../../../_lib/variasi.js';
import { jalankanMaterial } from '../../../../../_lib/stasiunMaterial.js';
import { susunStoryboard, renderPromptFlow, CTA_PILIHAN } from '../../../../../_lib/stasiunStoryboard.js';
import { periksaRetensi } from '../../../../../_lib/retensi.js';

export async function onRequestPost({ env, params }) {
  const id = parseInt(params?.id ?? '', 10);
  if (!Number.isInteger(id) || id <= 0) return jsonError('id pesanan tidak valid', 400);

  let order;
  try {
    order = await env.DB.prepare(
      `SELECT id, property_id, character_id, status, variation_key, params_json
         FROM viralframe_orders WHERE id = ?`
    ).bind(id).first();
  } catch (err) {
    console.error('[vf jalankan] baca pesanan', err.message);
    return jsonError('Gagal membaca pesanan', 500);
  }
  if (!order) return jsonError('Pesanan tidak ditemukan', 404);

  try {
    // ── STASIUN 2 — MATERIAL ────────────────────────────────────────────────
    // Foto belum berlabel → jalankan satu lintasan visi. Tidak sekaligus semua:
    // satu lintasan = 6 foto (terukur 2,3–3,8 detik), dan listing dengan 20 foto
    // butuh beberapa klik. Itu disengaja — tiap lintasan tersimpan, jadi bisa
    // dilanjut kapan saja tanpa mengulang.
    if (order.status === 'baru' || order.status === 'material') {
      const labelSekarang = await hitungLabel(env, order.property_id);
      // ⚠️ Gerbangnya "belum DINILAI", bukan "belum BERLABEL".
      //
      // Versi pertama memakai `labelSekarang.unik === 0`, sehingga listing yang
      // fotonya sudah dilabeli MANUAL melewati stasiun Material sepenuhnya —
      // dan ikut kehilangan dua keluaran lain dari lintasan visi yang sama:
      // `vf_skor` (peringkat foto jadi rata, urutan jatuh ke is_cover) dan
      // `vf_catatan` (DNA Produk kehilangan seluruh bagian "keunikan").
      // Terjadi pada properti 1025: 3 foto berlabel manual, ketiganya vf_skor NULL.
      //
      // Aman dijalankan pada foto berlabel: `stasiunMaterial` memakai
      // `COALESCE(NULLIF(TRIM(label_ruangan),''), ?)` sehingga label manusia
      // tidak pernah ditimpa — hanya skor & catatan yang ditulis.
      if (labelSekarang.belumDinilai > 0) {
        const m = await jalankanMaterial(env, order.property_id);
        if (!m.ok) {
          await setStatus(env, id, 'material', m.error);
          await catatKegagalan(env, id, order, 'Material', m.error);
          return jsonError(m.error ?? 'Stasiun Material gagal', 502);
        }
        const setelah = await hitungLabel(env, order.property_id);
        // Tetap di 'material' walau label sudah terisi: variasinya dipilih pada
        // panggilan BERIKUTNYA, bukan di sini. Menjejalkan dua stasiun ke satu
        // panggilan membuat kegagalan variasi ikut membatalkan hasil visi yang
        // sudah dibayar — padahal hasil visi itu milik listing, bukan pesanan.
        await setStatus(env, id, 'material', null);
        return jsonOk({
          status: 'material',
          selesai: false,
          dinilai: m.dinilai,
          sisa: m.sisa,
          provider: m.provider,
          pesan: `${m.dinilai} foto dinilai (${setelah.unik} label unik). ${m.sisa > 0 ? `Sisa ${m.sisa} foto — jalankan lagi.` : 'Jalankan lagi untuk memilih variasi.'}`,
        });
      }

      // ── STASIUN 3 — VARIASI ───────────────────────────────────────────────
      // Listing tanpa satu pun foto berlabel tidak bisa dilanjutkan. Dijaga di
      // sini dengan pesannya sendiri: tanpa ini `maksVariasi(0)` mengembalikan 0
      // dan user melihat "Rotasi listing ini sudah 0 dari 0 variasi" — benar
      // secara aritmetika, tapi tidak menjelaskan bahwa masalahnya foto.
      if (labelSekarang.unik === 0) {
        const pesan = 'Listing ini tidak punya foto yang bisa dipakai. Tambahkan foto properti dulu di Detail Properti.';
        await setStatus(env, id, 'material', pesan);
        return jsonError(pesan, 422);
      }

      const riwayat = await env.DB.prepare(
        `SELECT variation_key FROM viralframe_orders
          WHERE property_id = ? AND variation_key IS NOT NULL
          ORDER BY created_at DESC LIMIT 100`
      ).bind(order.property_id).all();
      const riwayatKunci = (riwayat.results ?? []).map(r => r.variation_key).filter(Boolean);

      const plafon = maksVariasi(labelSekarang.unik);
      if (riwayatKunci.length >= plafon) {
        const pesan = `Rotasi listing ini sudah ${riwayatKunci.length} dari ${plafon} variasi yang masuk akal `
          + `untuk ${labelSekarang.unik} label foto. Tambah foto berlabel untuk membuka lebih banyak.`;
        await setStatus(env, id, 'gagal', pesan);
        return jsonError(pesan, 422);
      }

      const pilihan = pilihVariasi({ riwayatKunci, labelFoto: labelSekarang.daftar });
      if (!pilihan) {
        await setStatus(env, id, 'gagal', 'Ruang variasi habis untuk listing ini.');
        return jsonError('Ruang variasi habis untuk listing ini.', 422);
      }

      // ⚠️ UNIQUE(property_id, variation_key) yang jadi penegak sebenarnya.
      // Selector sudah menghindari duplikat, tapi dua permintaan bersamaan bisa
      // memilih kunci sama — DB yang menolaknya, bukan pengecekan aplikasi.
      try {
        await env.DB.prepare(
          `UPDATE viralframe_orders
              SET variation_key = ?, status = 'variasi', catatan = NULL, updated_at = datetime('now')
            WHERE id = ?`
        ).bind(pilihan.kunci, id).run();
      } catch (err) {
        if (/UNIQUE/i.test(err.message)) {
          return jsonError('Variasi itu baru saja terpakai pesanan lain. Jalankan lagi.', 409);
        }
        throw err;
      }

      return jsonOk({
        status: 'variasi',
        selesai: false,
        variation_key: pilihan.kunci,
        variasi: ringkasVariasi(pilihan.vektor),
        rotasi: { ke: riwayatKunci.length + 1, dari: plafon, label_unik: labelSekarang.unik },
        jarak_dari_terbaru: pilihan.jarakTerdekat,
        longgar: pilihan.longgar,
        pesan: `Variasi terpilih: ${ringkasVariasi(pilihan.vektor).map(x => x.label).join(' · ')}`,
      });
    }

    // ── STASIUN 4 & 5 — KONSEP + STORYBOARD ─────────────────────────────────
    if (order.status === 'variasi' || order.status === 'storyboard') {
      const [prop, agent, fotoRes] = await Promise.all([
        // Kolom yang dibaca dnaProduk.js ikut diambil di sini. `furnished` dulu
        // tidak pernah dibaca sama sekali (mesin lama menghardcode "tidak
        // disebutkan"), jadi data yang ADA dibuang dan model mengisinya dengan
        // karangan — kelas bug yang sudah terjadi tiga kali di project ini.
        env.DB.prepare(
          `SELECT id, kode_listing, title, jenis_properti, tujuan, harga,
                  kelurahan, kecamatan, kabupaten,
                  luas_tanah, luas_bangunan, jumlah_kamar_tidur, jumlah_kamar_mandi,
                  lantai, lebar_depan, lebar_jalan_m, furnished, legalitas,
                  income_per_bulan, harga_sewa_kamar_bulan, deskripsi
             FROM properties WHERE id = ?`
        ).bind(order.property_id).first(),
        env.DB.prepare(
          'SELECT id, nama, gender, usia, etnik, style, ciri_fisik, foto_url FROM viralframe_characters WHERE id = ?'
        ).bind(order.character_id).first(),
        // Foto TERBAIK dulu: skor visi lebih dulu daripada is_cover. Cover dipilih
        // karena menjual di katalog, belum tentu bagus untuk gerak kamera.
        env.DB.prepare(
          `SELECT id, label_ruangan, vf_skor, vf_catatan
             FROM property_images
            WHERE property_id = ? AND label_ruangan IS NOT NULL AND TRIM(label_ruangan) != ''
            ORDER BY COALESCE(vf_skor, 50) DESC, is_cover DESC, urutan ASC
            LIMIT 14`
        ).bind(order.property_id).all(),
      ]);
      if (!prop) return jsonError('Properti tidak ditemukan', 404);
      if (!agent) return jsonError('Agent tidak ditemukan', 404);

      const foto = fotoRes.results ?? [];
      if (foto.length === 0) {
        await setStatus(env, id, 'material', 'Foto berlabel hilang — jalankan stasiun Material lagi.');
        return jsonError('Listing ini tidak punya foto berlabel lagi.', 422);
      }

      const p = amanParams(order.params_json);
      const ir = await susunStoryboard(env, {
        prop, agent, variationKey: order.variation_key, params: p, foto,
        dnaOverride: p.dna,
      });
      if (!ir.ok) {
        await setStatus(env, id, 'storyboard', ir.error);
        await catatKegagalan(env, id, order, 'Storyboard', ir.error);
        return jsonError(ir.error, 502);
      }

      const promptFlow = renderPromptFlow({ ir, prop, params: p });
      // Retention check dijalankan DI SINI juga, bukan hanya di browser: hasilnya
      // ikut tersimpan sehingga pesanan lama tetap membawa catatannya saat dibuka
      // ulang, dan cacatnya bisa dilihat tanpa menghitung ulang.
      const retensi = periksaRetensi({ ir, params: p });
      const hasil = {
        konsep: ir.konsep,
        parts: ir.parts,
        prompt_flow: promptFlow,
        dna: ir.dna,
        dna_agent: ir.dnaAgent,
        // Vektor variasi ikut disimpan, bukan hanya `variation_key` di kolomnya:
        // stasiun Caption & Adu Hook membacanya untuk tetap sejalan dengan gaya
        // yang sudah ditetapkan, dan mengurai ulang kunci teks di tiap pemanggil
        // berarti tiga tempat yang harus sepakat soal formatnya.
        variasi: ir.variasi,
        retensi,
        provider: ir.provider,
        params: p,
      };

      await env.DB.prepare(
        `UPDATE viralframe_orders
            SET status = 'menunggu_render', hasil_json = ?, catatan = NULL, updated_at = datetime('now')
          WHERE id = ?`
      ).bind(JSON.stringify(hasil), id).run();

      return jsonOk({
        status: 'menunggu_render',
        selesai: true,
        konsep: ir.konsep,
        retensi,
        jumlah_part: promptFlow.length,
        provider: ir.provider,
        pesan: `Storyboard siap — ${promptFlow.length} prompt Google Flow. ${retensi.ringkas}`,
      });
    }

    return jsonOk({
      status: order.status,
      selesai: order.status === 'menunggu_render' || order.status === 'selesai',
      pesan: order.status === 'menunggu_render'
        ? 'Prompt sudah siap — tinggal dirender di Google Flow lalu unggah hasilnya.'
        : `Tidak ada stasiun untuk status "${order.status}".`,
    });
  } catch (err) {
    console.error('[vf jalankan]', err.message);
    await logServerError(env, {
      source: 'server',
      message: `[viralframe] jalankan stasiun gagal (pesanan ${id}, status ${order.status}) — ${err.message}`,
      stack: err.stack,
      url: `/api/admin/viralframe/orders/${id}/jalankan`,
      context: { order_id: id, property_id: order.property_id, status: order.status },
    });
    return jsonError('Gagal menjalankan stasiun', 500);
  }
}

async function hitungLabel(env, propertyId) {
  const [label, nilai] = await env.DB.batch([
    env.DB.prepare(
      `SELECT DISTINCT TRIM(label_ruangan) AS label
         FROM property_images
        WHERE property_id = ? AND label_ruangan IS NOT NULL AND TRIM(label_ruangan) != ''`
    ).bind(propertyId),
    // Foto yang belum melewati lintasan visi. Dipakai sebagai GERBANG stasiun
    // Material — lihat alasannya di pemanggil.
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM property_images
        WHERE property_id = ? AND vf_dinilai_at IS NULL`
    ).bind(propertyId),
  ]);
  const daftar = (label.results ?? []).map(x => x.label).filter(Boolean);
  return {
    unik: daftar.length,
    daftar,
    belumDinilai: nilai.results?.[0]?.n ?? 0,
  };
}

/**
 * Catat kegagalan stasiun ke `error_logs` supaya terlihat di Admin → Errors.
 *
 * ⚠️ Sebelum ini kedua jalur 502 hanya menulis ke `viralframe_orders.catatan` —
 * terbaca cuma kalau pesanan itu kebetulan dibuka. Itu kelas kegagalan yang
 * PERSIS SAMA dengan `[scheduler]` yang dulu menyembunyikan Instagram gagal
 * 14/14 selama berhari-hari: gagalnya nyata, jejaknya tidak ke mana-mana.
 *
 * `source` WAJIB 'server' — filter di `errors/index.js` hanya menerima
 * client|server, nilai lain LENYAP justru saat admin memfilter. Penanda ada di
 * awal message.
 */
async function catatKegagalan(env, id, order, stasiun, pesan) {
  await logServerError(env, {
    source: 'server',
    message: `[viralframe] stasiun ${stasiun} gagal (pesanan ${id}) — ${String(pesan ?? 'tanpa detail').slice(0, 300)}`,
    url: `/api/admin/viralframe/orders/${id}/jalankan`,
    context: {
      order_id: id,
      property_id: order.property_id,
      character_id: order.character_id,
      status: order.status,
      variation_key: order.variation_key,
    },
  });
}

async function setStatus(env, id, status, catatan) {
  await env.DB.prepare(
    `UPDATE viralframe_orders SET status = ?, catatan = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(status, catatan ?? null, id).run();
}

/**
 * Lima parameter manusia, dengan default dari LAPIS KONSTANTA.
 * Nilai di luar batas dikembalikan ke default, bukan ditolak: parameter ini
 * penyimpangan yang diizinkan, dan menggagalkan seluruh pesanan karena satu
 * angka aneh lebih merugikan daripada memakai yang benar.
 */
function amanParams(json) {
  let raw = {};
  try { raw = json ? JSON.parse(json) : {}; } catch { raw = {}; }
  const int = (v, min, max, bawaan) => {
    const n = parseInt(v, 10);
    return Number.isInteger(n) && n >= min && n <= max ? n : bawaan;
  };
  const jumlahPart = int(raw.jumlah_part, 1, 3, FLOW.partPerVideo);
  const detikPerPart = int(raw.detik_per_part, 4, FLOW.detikPerPart, FLOW.detikPerPart);
  return {
    jumlahPart,
    detikPerPart,
    voDetikPerPart: int(raw.vo_detik_per_part, 2, detikPerPart, voDetikBaku(detikPerPart)),
    cta: CTA_PILIHAN.includes(raw.cta) ? raw.cta : 'survei',
    platform: typeof raw.platform === 'string' ? raw.platform.slice(0, 30) : 'tiktok',
    // DNA Produk hasil KOREKSI manusia di Panel Bahan. Dibiarkan lewat apa adanya
    // (setelah pemeriksaan bentuk) karena isinya memang teks bebas hasil suntingan;
    // yang penting bentuknya benar supaya dnaKeTeks() tidak meledak di tengah
    // penyusunan prompt. Tanpa ini, panel koreksi cuma hiasan.
    dna: bentukDna(raw.dna),
  };
}

/** Terima DNA hasil suntingan hanya bila bentuknya benar; selain itu abaikan. */
function bentukDna(v) {
  if (!v || typeof v !== 'object') return null;
  const arr = (x, maks) => (Array.isArray(x) ? x.slice(0, maks) : []);
  const fakta = arr(v.fakta, 24)
    .filter(f => f && typeof f === 'object' && typeof f.label === 'string')
    .map(f => ({ label: String(f.label).slice(0, 60), nilai: String(f.nilai ?? '').slice(0, 200) }));
  if (fakta.length === 0) return null;
  return {
    fakta,
    keunikan: arr(v.keunikan, 8).map(x => String(x).slice(0, 300)),
    ruangTerbukti: arr(v.ruangTerbukti, 24).map(x => String(x).slice(0, 60)),
    larangan: arr(v.larangan, 24).map(x => String(x).slice(0, 80)),
  };
}

/** Vektor → daftar {sumbu, id, label} siap tampil. */
function ringkasVariasi(vektor) {
  return SUMBU_DOMINAN.map(sumbu => {
    const nilai = vektor[sumbu];
    // `pembukaan` isinya label foto bebas, bukan enum — tidak ada katalognya.
    const entri = sumbu === 'pembukaan' ? null : entriSumbu(sumbu, nilai);
    return { sumbu, id: nilai, label: entri?.label ?? String(nilai ?? '-') };
  });
}

export async function onRequestOptions() { return handleOptions(); }
