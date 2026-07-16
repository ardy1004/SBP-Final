// POST /api/admin/viralframe/generate-naskah
// Auth via functions/api/admin/_middleware.js

import { getProviderKey, callChatCompletion } from '../../../_lib/aiProviders.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { property_title, jenis_properti, lokasi, jumlah_scene, durasi_per_scene } = body;

  const apiKey = await getProviderKey(env, 'deepseek');
  if (!apiKey) {
    return Response.json({ error: 'DeepSeek API key belum dikonfigurasi (isi via Pengaturan > AI Providers)' }, { status: 500 });
  }

  const target_kata = Math.floor((jumlah_scene || 1) * (durasi_per_scene || 8) * 1.9);

  const systemPrompt = `Kamu adalah copywriter properti profesional Indonesia. Tugas: tulis naskah voiceover video properti. Naskah harus: (1) natural diucapkan dengan suara, bukan dibaca, (2) durasi pas saat dibacakan dengan tempo normal (target ${target_kata} kata), (3) tidak ada tanda baca yang aneh saat diucapkan (hindari tanda kurung, tanda persen, singkatan seperti m² → tulis meter persegi), (4) awali dengan hook menarik tentang properti, akhiri dengan CTA singkat, (5) sisipkan 1 open loop di 3-5 detik pertama naskah (janjikan info yang baru dijawab di akhir naskah, bukan langsung dijelaskan), (6) setiap sekitar 15-20 kata sisipkan 1 micro-reward berupa fakta/angka konkret properti (bukan klaim generik), (7) tutup open loop dari poin (5) tepat sebelum CTA sebagai payoff — jangan biarkan menggantung tanpa jawaban. Respond HANYA teks naskah saja, tanpa label, tanpa penjelasan.`;

  const userPrompt = `Properti: ${property_title ?? 'Properti'}. Jenis: ${jenis_properti ?? 'Properti'}. Lokasi: ${lokasi ?? 'Yogyakarta'}. Target: ${target_kata} kata voiceover.`;

  const result = await callChatCompletion({
    provider: 'deepseek',
    apiKey,
    systemPrompt,
    userPrompt,
    maxTokens: 500,
    temperature: 0.4,
    timeoutMs: 25000,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  const naskah = result.content;
  const jumlah_kata = naskah.split(/\s+/).filter(Boolean).length;

  return Response.json({ naskah, jumlah_kata, target_kata });
}
