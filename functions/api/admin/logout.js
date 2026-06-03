import { handleOptions } from '../_shared/response.js';
import { makeSessionCookie } from '../_shared/jwt.js';

export async function onRequestPost(context) {
  const { env } = context;
  const cookie = makeSessionCookie('', true); // clear=true → Max-Age=0

  return new Response(
    JSON.stringify({ success: true, data: { message: 'Logout berhasil' } }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookie,
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      },
    }
  );
}

export async function onRequestOptions() {
  return handleOptions();
}
