/**
 * Cloudflare Pages catch-all Function — menangani SSR untuk semua rute publik.
 * Rute /api/* ditangani lebih dulu oleh functions/api/*.js (prioritas lebih tinggi).
 *
 * Import dari dist/server/index.js — tersedia setelah 'npm run build'.
 * Untuk dev: gunakan 'npm run dev' (react-router dev dengan cloudflareDevProxy).
 */

// eslint-disable-next-line import/no-unresolved
import { createRequestHandler } from "react-router";
import { withEdgeCache } from "./_lib/edgeCache.js";

// Server bundle di-generate oleh 'react-router build' ke dist/server/
// eslint-disable-next-line import/no-unresolved
import * as build from "../dist/server/index.js";

const handler = createRequestHandler(build, "production");

// 5 menit. Edit listing di admin tampil ke pengunjung dalam ≤ TTL ini tanpa aksi
// apa pun. Listing BARU tetap tampil seketika: URL yang belum pernah diminta
// selalu miss sehingga langsung dirender.
const TTL_HTML = 300;

const STATIC_EXT = [
  ".js", ".mjs", ".css", ".map",
  ".webp", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
  ".woff", ".woff2", ".ttf", ".eot",
  ".json", ".txt", ".xml", ".pdf",
];

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (
    url.pathname.startsWith("/assets/") ||
    STATIC_EXT.some((ext) => url.pathname.toLowerCase().endsWith(ext))
  ) {
    return context.next();
  }

  const { request, env, waitUntil } = context;

  // Cache HTML di edge. Render React tidak muat di 10 ms CPU paket Free, jadi
  // setiap request yang bisa dilayani dari cache adalah satu request yang tidak
  // berisiko kena Error 1102. Aturan kelayakan (termasuk larangan keras atas
  // /sign yang merender NIK) ada di functions/_lib/edgeCache.js.
  return withEdgeCache(context, { ttl: TTL_HTML }, () =>
    handler(request, {
      cloudflare: {
        env,
        ctx: { waitUntil: waitUntil.bind(context) },
      },
    }),
  );
}
