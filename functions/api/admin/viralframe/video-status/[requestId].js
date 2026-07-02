// GET /api/admin/viralframe/video-status/:requestId
// Auth via functions/api/admin/_middleware.js

const STATUS_MAP = {
  InQueue: 'pending',
  InProgress: 'processing',
  Succeed: 'succeed',
  Failed: 'failed',
};

export async function onRequestGet(context) {
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

  if (!sfRes.ok) {
    const errText = await sfRes.text().catch(() => '');
    return Response.json({ error: `SiliconFlow error ${sfRes.status}: ${errText}` }, { status: 502 });
  }

  const sfJson = await sfRes.json();
  const sfStatus = sfJson.status ?? '';
  const status = STATUS_MAP[sfStatus] ?? 'pending';
  const video_url = status === 'succeed' && sfJson.videos?.[0]?.url ? sfJson.videos[0].url : null;

  return Response.json({ status, video_url });
}
