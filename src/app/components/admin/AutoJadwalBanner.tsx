// Banner peringatan auto-jadwal di dashboard admin.
//
// Otomasi yang diam-diam mati adalah soal waktu saja — tidak ada yang menonton
// cron jam 1 pagi. Tiga kondisi yang ditampilkan (disepakati 2026-08-12):
//   a. ada agent yang gagal menjadwalkan
//   b. agent aktif tapi stok videonya habis
//   c. cron tidak jalan > 26 jam  ← satu-satunya cara tahu cron-nya mati
//
// Sengaja tidak memakai endpoint baru: seluruh datanya sudah ada di
// GET /agent-accounts, jadi ini murni perhitungan di client.

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle } from 'lucide-react';
import { getAgentAccounts } from '../../../lib/api';

const AMBANG_DIAM_JAM = 26; // > 24 jam + kelonggaran, supaya tidak berisik saat cron sedikit meleset

export default function AutoJadwalBanner() {
  const [pesan, setPesan] = useState<string[]>([]);

  useEffect(() => {
    let batal = false;
    getAgentAccounts().then(r => {
      if (batal || !r.success || !r.data) return;
      const { items, auto_aktif, auto_terakhir } = r.data;
      if (!auto_aktif) return; // auto sengaja dimatikan — bukan masalah

      const out: string[] = [];

      const jamDiam = auto_terakhir ? (Date.now() - new Date(auto_terakhir).getTime()) / 3600000 : Infinity;
      if (jamDiam > AMBANG_DIAM_JAM) {
        out.push(auto_terakhir
          ? `Auto-jadwal tidak jalan ${Math.floor(jamDiam)} jam terakhir — cek worker cron.`
          : 'Auto-jadwal belum pernah jalan sejak dinyalakan — cek worker cron.');
      }

      const gagal = items.filter(a => a.auto_aktif && (a.auto_hasil?.gagal ?? 0) > 0);
      if (gagal.length) out.push(`Gagal menjadwalkan: ${gagal.map(a => a.nama).join(', ')}.`);

      const kosong = items.filter(a => a.auto_aktif && a.video_aktif === 0);
      if (kosong.length) out.push(`Stok video habis: ${kosong.map(a => a.nama).join(', ')}.`);

      setPesan(out);
    }).catch(() => { /* banner bersifat tambahan — jangan pernah merusak dashboard */ });
    return () => { batal = true; };
  }, []);

  if (pesan.length === 0) return null;

  return (
    <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 mb-4">
      <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
      <div className="flex-1 text-sm text-amber-800">
        {pesan.map((p, i) => <div key={i}>{p}</div>)}
      </div>
      <Link to="/admin/viralframe/agent-videos" className="text-xs font-semibold text-amber-800 underline flex-shrink-0">Buka Konten Agent</Link>
    </div>
  );
}
