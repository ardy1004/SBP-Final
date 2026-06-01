/**
 * Cloudflare Pages catch-all Function — menangani SSR untuk semua rute publik.
 * Rute /api/* ditangani lebih dulu oleh functions/api/*.js (prioritas lebih tinggi).
 *
 * Import dari dist/server/index.js — tersedia setelah 'npm run build'.
 * Untuk dev: gunakan 'npm run dev' (react-router dev dengan cloudflareDevProxy).
 */

// eslint-disable-next-line import/no-unresolved
import { createRequestHandler } from "react-router";

// Server bundle di-generate oleh 'react-router build' ke dist/server/
// eslint-disable-next-line import/no-unresolved
import * as build from "../dist/server/index.js";

const handler = createRequestHandler(build, "production");

export async function onRequest(context) {
  const { request, env, waitUntil } = context;
  return handler(request, {
    cloudflare: {
      env,
      ctx: { waitUntil: waitUntil.bind(context) },
    },
  });
}
