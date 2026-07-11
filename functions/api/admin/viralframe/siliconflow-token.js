// GET /api/admin/viralframe/siliconflow-token — DINONAKTIFKAN
//
// Endpoint ini dulu mengembalikan SILICONFLOW_API_KEY mentah ke browser, yang
// membocorkan kredensial akun permanen ke network tab / memori klien.
// Submit video sekarang di-proxy lewat /api/admin/viralframe/submit-video
// sehingga API key tidak pernah keluar dari Worker. Endpoint ini sengaja
// dipertahankan sebagai 410 Gone untuk menangkap klien lama yang belum ter-update.

export async function onRequestGet() {
  return Response.json(
    { error: 'Endpoint dinonaktifkan. Gunakan /api/admin/viralframe/submit-video.' },
    { status: 410 },
  );
}
