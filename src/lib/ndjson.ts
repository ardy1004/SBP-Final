// Pembaca respons NDJSON streaming — SATU SUMBER untuk semua endpoint AI.
//
// KENAPA STREAMING: Cloudflare Workers membunuh request yang belum mengirim
// apa pun setelah 30 detik wall-clock, lalu membalas halaman HTML error-nya
// sendiri. Kalau frontend memanggil res.json() atas HTML itu, yang muncul ke
// user adalah `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` —
// pesan yang tidak berarti apa-apa baginya. Endpoint AI karena itu mengalirkan
// baris NDJSON (heartbeat tiap 2 detik) sehingga respons "dimulai" sejak awal
// dan batas wall-clock tidak berlaku.
//
// Format yang diharapkan: satu objek JSON per baris. Baris terakhir yang
// ber-`done: true` membawa `data` (sukses) atau `error` (gagal).

export interface NdjsonProgress {
  /** Dipanggil tiap baris non-final diterima — untuk indikator progres. */
  onProgress?: (msg: Record<string, unknown>) => void;
  /** AbortSignal supaya pemanggil bisa membatalkan. */
  signal?: AbortSignal;
}

export async function readNdjsonFinal<T>(r: Response, opts: NdjsonProgress = {}): Promise<T> {
  // Endpoint membalas JSON biasa (bukan stream) untuk error yang terdeteksi
  // lebih awal — mis. 401 dari middleware auth atau 422 validasi.
  const ct = r.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error ?? `Gagal memproses permintaan (HTTP ${r.status})`);
  }

  // Bukan JSON dan bukan NDJSON = halaman HTML error dari platform. Jangan
  // pernah menyerahkannya ke JSON.parse — beri pesan yang bisa dimengerti user.
  if (!ct.includes('ndjson')) {
    throw new Error(
      r.status === 502 || r.status === 504
        ? 'Server AI tidak merespons tepat waktu. Coba lagi sebentar.'
        : `Server mengembalikan respons tak terduga (HTTP ${r.status}). Coba lagi.`
    );
  }

  if (!r.ok || !r.body) throw new Error(`Gagal memproses permintaan (HTTP ${r.status})`);

  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let final: { done?: boolean; data?: T; error?: string } | null = null;

  try {
    for (;;) {
      if (opts.signal?.aborted) throw new DOMException('Dibatalkan', 'AbortError');
      const { done, value } = await reader.read();
      if (value) buf += dec.decode(value, { stream: true });

      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const o = JSON.parse(line);
          if (o.done) final = o;
          else opts.onProgress?.(o);
        } catch {
          /* baris rusak/terpotong — abaikan, baris berikutnya masih mungkin utuh */
        }
      }
      if (done) break;
    }
  } finally {
    // Lepaskan koneksi saat dibatalkan agar server tahu tidak ada lagi pembaca.
    reader.cancel().catch(() => {});
  }

  if (!final) throw new Error('Koneksi terputus sebelum hasil diterima. Coba lagi.');
  if (final.error || final.data == null) throw new Error(final.error ?? 'Gagal memproses permintaan');
  return final.data;
}
