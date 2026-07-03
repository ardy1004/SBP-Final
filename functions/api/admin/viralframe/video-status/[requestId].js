// GET /api/admin/viralframe/video-status/:requestId
// Auth via functions/api/admin/_middleware.js

const STATUS_MAP = {
  InQueue: 'pending',
  InProgress: 'processing',
  Succeed: 'succeed',
  Failed: 'failed',
};

export async function onRequestGet(context) {
  try {
    const { params, env } = context;
    const requestId = params.requestId;

    if (!requestId) {
      return Response.json({ error: 'requestId tidak valid' }, { status: 400 });
    }

    const apiKey = env.SILICONFLOW_API_KEY;
    if (!apiKey) {
      return Response.json({ error: 'SILICONFLOW_API_KEY tidak dikonfigurasi' }, { status: 500 });
    }

    let sfRes;
    try {
      sfRes = await fetch(`https://api.siliconflow.com/v1/video/status/${requestId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    } catch (err) {
      return Response.json({ error: `Gagal menghubungi SiliconFlow: ${err.message}` }, { status: 502 });
    }

    // Cek status SEBELUM baca body — hindari crash CPU saat baca response besar/lambat
    if (!sfRes.ok) {
      return Response.json({ status: 'failed', video_url: null, error: `SiliconFlow status HTTP ${sfRes.status}` });
    }

    let sfJson;
    try {
      sfJson = await sfRes.json();
    } catch {
      return Response.json({ status: 'failed', video_url: null, error: 'SiliconFlow return non-JSON saat status 200' });
    }

    const sfStatus = sfJson.status ?? '';
    const status = STATUS_MAP[sfStatus] ?? 'pending';
    const video_url = status === 'succeed' && sfJson.videos?.[0]?.url ? sfJson.videos[0].url : null;
    const reason = sfJson.reason ?? sfJson.message ?? sfJson.data?.reason ?? null;

    return Response.json({ status, video_url, reason, _raw: status === 'failed' ? sfJson : undefined });
  } catch (err) {
    return Response.json({ status: 'failed', video_url: null, error: err.message ?? 'Internal error' });
  }
}
