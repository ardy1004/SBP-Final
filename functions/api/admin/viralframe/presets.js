// GET/POST/DELETE /api/admin/viralframe/presets — preset parameter Step 1 tim.
// Disimpan di settings D1 (key 'viralframe_presets') sebagai JSON array — tanpa migration.
// Auth: _middleware.js

import { jsonOk, jsonError, handleOptions } from '../../_shared/response.js';

const KEY = 'viralframe_presets';
const MAX_PRESETS = 30;

async function readPresets(env) {
  try {
    const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(KEY).first();
    if (row?.value) { const a = JSON.parse(row.value); if (Array.isArray(a)) return a; }
  } catch { /* ignore */ }
  return [];
}
async function writePresets(env, arr) {
  await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .bind(KEY, JSON.stringify(arr.slice(0, MAX_PRESETS))).run();
}

export async function onRequestGet({ env }) {
  return jsonOk({ items: await readPresets(env) });
}

export async function onRequestPost({ env, request }) {
  let body;
  try { body = await request.json(); } catch { return jsonError('Body JSON tidak valid', 400); }
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
  if (!name) return jsonError('Nama preset wajib', 422);
  if (typeof body.params !== 'object' || body.params === null) return jsonError('params wajib', 422);

  const arr = await readPresets(env);
  const params = {};
  // Whitelist field yang boleh disimpan (subset Step 1) — hindari menyimpan foto/scene.
  const ALLOW = ['archetype', 'register', 'tone', 'visualStyle', 'hookType', 'ctaType', 'ctaKeyword',
    'platforms', 'aiTool', 'ratio', 'language', 'sceneCount', 'durationMode', 'uniformDuration'];
  for (const k of ALLOW) if (k in body.params) params[k] = body.params[k];

  const idx = arr.findIndex(p => p.name === name);
  const entry = { name, params, updated_at: new Date().toISOString() };
  if (idx >= 0) arr[idx] = entry; else arr.unshift(entry);

  try { await writePresets(env, arr); return jsonOk({ saved: true, items: arr.slice(0, MAX_PRESETS) }); }
  catch (err) { console.error('[vf presets POST]', err.message); return jsonError('Gagal menyimpan preset', 500); }
}

export async function onRequestDelete({ env, request }) {
  const name = new URL(request.url).searchParams.get('name') ?? '';
  if (!name) return jsonError('name wajib', 400);
  const arr = (await readPresets(env)).filter(p => p.name !== name);
  try { await writePresets(env, arr); return jsonOk({ deleted: true, items: arr }); }
  catch (err) { console.error('[vf presets DELETE]', err.message); return jsonError('Gagal menghapus preset', 500); }
}

export async function onRequestOptions() { return handleOptions(); }
