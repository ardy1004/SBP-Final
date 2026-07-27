import { useState } from 'react';
import { Copy, Check, FileImage } from 'lucide-react';
import { sceneFileName, getLipsync } from './options';
import { promptToText, asVeoPrompt, type ParsedJSON } from './jsonValidator';

interface SceneAssignLite { photoId: number | null; label: string }

const ROLE_BADGE: Record<string, string> = {
  Hook: 'bg-amber-100 text-amber-700 border-amber-200',
  Body: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  CTA: 'bg-indigo-100 text-indigo-700 border-indigo-200',
};

function badgeCls(role: string | undefined): string {
  const r = (role ?? '').split(/[\s|]/)[0]; // ambil kata pertama (mis. "Hook" dari "Hook | Body")
  return ROLE_BADGE[r] ?? 'bg-gray-100 text-gray-600 border-gray-200';
}

export default function SceneCards({ data, scenes, durations }: {
  data: ParsedJSON;
  scenes: SceneAssignLite[];
  durations: number[];
}) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const list = data.scenes ?? [];
  const pn = data.production_notes ?? {};

  const copyPrompt = async (idx: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(c => (c === idx ? null : c)), 2000);
    } catch { /* clipboard tidak tersedia */ }
  };

  return (
    <div className="space-y-4">
      {list.map((sc, i) => {
        const role = sc.role ?? '';
        const durasi = durations[i] ?? durations[0] ?? 6;
        const maxWords = getLipsync(durasi).maxWords;
        const wc = Number(sc.word_count) || (sc.script_narration ? sc.script_narration.trim().split(/\s+/).length : 0);
        const wcOk = wc <= Math.ceil(maxWords * 1.1);
        const label = scenes[i]?.label || sc.photo_reference_label || '(belum dilabeli)';
        const fileName = sceneFileName(i, label);
        // Prompt bisa berbentuk string (tool biasa) atau OBJEK terstruktur (Veo/Flow).
        // promptToText() menyerialisasi objek apa adanya — itulah yang ditempel user
        // ke Flow, karena Veo menerima prompt berformat JSON sebagai teks.
        const prompt = promptToText(sc.ai_ready_prompt);
        const veo = asVeoPrompt(sc.ai_ready_prompt);
        const dialogLine = veo?.dialogue?.line?.trim() ?? '';

        return (
          <div key={i} className="border border-gray-200 rounded-2xl p-4 space-y-3 bg-white">
            {/* Header badge */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${badgeCls(role)}`}>
                  Scene {sc.scene_number ?? i + 1} · {role || '—'}
                </span>
                <span className="text-xs text-[#64748B]">{durasi}s</span>
                <span className={`text-xs flex items-center gap-1 ${wcOk ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {wcOk ? '✅' : '⚠️'} {wc}/{maxWords} kata
                </span>
                {/* Penanda audio native: sekali lihat ketahuan videonya akan bersuara
                    atau bisu — inti temuan audit ViralFrame 2026-07-26. */}
                {veo && (
                  <span
                    className={`text-xs flex items-center gap-1 ${dialogLine ? 'text-emerald-600' : 'text-red-600'}`}
                    title={dialogLine
                      ? 'Dialog tertanam di prompt — Veo/Flow akan mengucapkannya'
                      : 'dialogue.line kosong — video akan BISU di Veo/Flow'}>
                    {dialogLine ? '🔊 dialog tertanam' : '🔇 tanpa dialog'}
                  </span>
                )}
              </div>
              <span className="flex items-center gap-1 text-[11px] text-[#94A3B8] font-mono">
                <FileImage size={12} /> File: {fileName}
              </span>
            </div>

            {/* Narasi */}
            {sc.script_narration && (
              <div>
                <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">Narasi</div>
                <p className="text-sm text-[#0F172A] leading-relaxed">{sc.script_narration}</p>
              </div>
            )}

            {/* AI ready prompt */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide">AI Ready Prompt</div>
                <button onClick={() => copyPrompt(i, prompt)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors"
                  style={{ color: copiedIdx === i ? '#10B981' : '#1565C0' }}>
                  {copiedIdx === i ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy Prompt Scene {i + 1}</>}
                </button>
              </div>
              <pre className="w-full p-3 border border-gray-200 rounded-xl text-xs font-mono text-[#0F172A] bg-[#F8FAFC] whitespace-pre-wrap break-words leading-relaxed">{prompt || '(kosong)'}</pre>
            </div>

            {/* On-screen text + transisi */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {sc.on_screen_text && (
                <div>
                  <div className="font-semibold text-[#64748B] uppercase tracking-wide mb-0.5">On-Screen Text</div>
                  <p className="text-[#0F172A]">{sc.on_screen_text}</p>
                </div>
              )}
              {sc.transition_to_next && (
                <div>
                  <div className="font-semibold text-[#64748B] uppercase tracking-wide mb-0.5">Transisi → Berikutnya</div>
                  <p className="text-[#0F172A]">{sc.transition_to_next}</p>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Production notes */}
      <div className="border border-gray-200 rounded-2xl p-4 space-y-3 bg-[#F8FAFC]">
        <div className="font-display font-bold text-[#0F172A] text-sm">Production Notes</div>
        {pn.caption && (
          <div>
            <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-0.5">Caption</div>
            <p className="text-sm text-[#0F172A]">{pn.caption}</p>
          </div>
        )}
        {Array.isArray(pn.hashtags) && pn.hashtags.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-0.5">Hashtags</div>
            <p className="text-sm text-[#1565C0] font-medium">{pn.hashtags.map(h => `#${String(h).replace(/^#/, '')}`).join(' ')}</p>
          </div>
        )}
        {pn.thumbnail_concept && (
          <div>
            <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-0.5">Konsep Thumbnail</div>
            <p className="text-sm text-[#0F172A]">{pn.thumbnail_concept}</p>
          </div>
        )}
        {pn.posting_time_suggestion && (
          <div>
            <div className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-0.5">Saran Waktu Posting</div>
            <p className="text-sm text-[#0F172A]">{pn.posting_time_suggestion}</p>
          </div>
        )}
      </div>
    </div>
  );
}
