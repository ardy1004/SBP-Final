import { useState, useEffect } from 'react';
import { MapPin, RefreshCw, Download, CheckCircle, AlertCircle, Database } from 'lucide-react';

const WILAYAH_BASE = '/api/admin/locations/proxy?path=';
const IMPORT_URL = '/api/admin/locations/import';
const CHUNK_SIZE = 1500;

interface Stat { provinsi: number; kabupaten: number; kecamatan: number }
type Status = 'idle' | 'running' | 'done' | 'error';

async function fetchJSON(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function AdminLokasiPage() {
  const [stats, setStats] = useState<Stat | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState('');
  const [inserted, setInserted] = useState(0);
  const [errLog, setErrLog] = useState<string[]>([]);

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const res = await fetch('/api/admin/locations/stats', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setStats({
        provinsi: json.provinsi ?? 0,
        kabupaten: json.kabupaten ?? 0,
        kecamatan: json.kecamatan ?? 0,
      });
    } catch { /* ignore */ }
    finally { setStatsLoading(false); }
  };

  useEffect(() => { loadStats(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const postChunk = async (rows: object[]) => {
    const doPost = () => fetch(IMPORT_URL, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    });
    let res = await doPost();
    if (res.status === 503 || res.status === 429) {
      await new Promise(r => setTimeout(r, 2000));
      res = await doPost();
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return (json as { inserted?: number }).inserted ?? 0;
  };

  const handleImport = async () => {
    if (!confirm(
      'Ini akan menghapus data lokasi existing dan mengimport ulang dari wilayah.id (~7.800 lokasi).\nProses ~2-3 menit. Lanjutkan?'
    )) return;

    setStatus('running');
    setProgress('Mereset data lokasi…');
    setInserted(0);
    setErrLog([]);

    try {
      // 1. Reset
      await fetch(IMPORT_URL, { method: 'DELETE', credentials: 'include' });
      const verifyReset = await fetch('/api/locations').then(r => r.json());
      if ((verifyReset.data?.items ?? []).length > 0) {
        throw new Error('Reset gagal, tidak bisa lanjut import');
      }

      // 2. Fetch provinces
      setProgress('Mengambil data provinsi…');
      const provData = await fetchJSON(`${WILAYAH_BASE}provinces.json`);
      const provinces: { code: string; name: string }[] = provData.data ?? [];

      const allRows: { kode: string; nama: string; parent_kode: string | null }[] = [];
      provinces.forEach(p => allRows.push({ kode: p.code, nama: p.name, parent_kode: null }));

      // 3. Fetch regencies per province
      const regencies: { code: string; name: string; province_code: string }[] = [];
      for (let i = 0; i < provinces.length; i++) {
        const prov = provinces[i];
        setProgress(`Mengambil kabupaten [${i + 1}/${provinces.length}] — ${prov.name}`);
        try {
          const d = await fetchJSON(`${WILAYAH_BASE}regencies/${prov.code}.json`);
          const items: { code: string; name: string }[] = d.data ?? [];
          items.forEach(r => {
            allRows.push({ kode: r.code, nama: r.name, parent_kode: prov.code });
            regencies.push({ code: r.code, name: r.name, province_code: prov.code });
          });
        } catch (err) {
          const msg = `Gagal: kabupaten provinsi ${prov.name}`;
          setErrLog(prev => [...prev, msg]);
        }
      }

      // 4. Fetch districts per regency
      for (let i = 0; i < regencies.length; i++) {
        const reg = regencies[i];
        if (i % 10 === 0) setProgress(`Mengambil kecamatan [${i + 1}/${regencies.length}] — ${reg.name}`);
        try {
          const d = await fetchJSON(`${WILAYAH_BASE}districts/${reg.code}.json`);
          const items: { code: string; name: string }[] = d.data ?? [];
          items.forEach(dist => {
            allRows.push({ kode: dist.code, nama: dist.name, parent_kode: reg.code });
          });
        } catch {
          setErrLog(prev => [...prev, `Gagal: kecamatan kabupaten ${reg.name}`]);
        }
      }

      // 5. POST in chunks
      const totalChunks = Math.ceil(allRows.length / CHUNK_SIZE);
      let totalInserted = 0;
      for (let i = 0; i < totalChunks; i++) {
        const chunk = allRows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        setProgress(`Menyimpan ke database [${i + 1}/${totalChunks}]…`);
        try {
          totalInserted += await postChunk(chunk);
        } catch {
          setErrLog(prev => [...prev, `Gagal kirim batch ${i + 1}`]);
        }
      }

      setInserted(totalInserted);
      setStatus('done');
      setProgress('');
      loadStats();
    } catch (err) {
      setStatus('error');
      setProgress('');
      setErrLog(prev => [...prev, String(err)]);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-[#1565C0]/10 rounded-xl flex items-center justify-center">
          <MapPin size={20} className="text-[#1565C0]" />
        </div>
        <div>
          <h1 className="font-display font-bold text-[#0F172A] text-xl">Data Lokasi</h1>
          <p className="text-sm text-[#64748B]">Kelola data wilayah Indonesia untuk cascade dropdown</p>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-[#0F172A] flex items-center gap-2">
            <Database size={16} /> Data di Database
          </h2>
          <button onClick={loadStats} disabled={statsLoading}
            className="text-xs text-[#1565C0] hover:underline flex items-center gap-1 disabled:opacity-40">
            <RefreshCw size={12} className={statsLoading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
        {stats ? (
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { label: 'Provinsi', val: stats.provinsi },
              { label: 'Kab./Kota', val: stats.kabupaten },
              { label: 'Kecamatan', val: stats.kecamatan || '—' },
            ].map(s => (
              <div key={s.label} className="bg-[#F0F4F8] rounded-xl p-3">
                <div className="font-bold text-2xl text-[#1565C0]">{s.val}</div>
                <div className="text-xs text-[#64748B] mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-16 bg-gray-100 animate-pulse rounded-xl" />
        )}
      </div>

      {/* Import */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
        <h2 className="font-semibold text-[#0F172A] mb-2 flex items-center gap-2">
          <Download size={16} /> Import Data Wilayah Indonesia
        </h2>
        <p className="text-sm text-[#64748B] mb-4">
          Mengambil data dari <code className="bg-gray-100 px-1 rounded text-xs">wilayah.id</code> (kode Kemendagri).
          Import mencakup ~38 provinsi, ~514 kabupaten, ~7.266 kecamatan. Proses ~2–3 menit.
          Data lokasi existing akan dihapus dan diganti.
        </p>

        <button
          onClick={handleImport}
          disabled={status === 'running'}
          className="w-full py-3 rounded-xl font-semibold text-sm transition-all
            bg-[#1565C0] text-white hover:bg-[#0D47A1] disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {status === 'running' ? 'Memproses…' : 'Import Data Wilayah Indonesia'}
        </button>

        {/* Progress */}
        {status === 'running' && progress && (
          <div className="mt-4 flex items-center gap-2 text-sm text-[#64748B]">
            <div className="w-4 h-4 border-2 border-[#1565C0]/20 border-t-[#1565C0] rounded-full animate-spin flex-shrink-0" />
            <span>{progress}</span>
          </div>
        )}

        {/* Done */}
        {status === 'done' && (
          <div className="mt-4 flex items-center gap-2 text-sm text-[#10B981]">
            <CheckCircle size={16} />
            <span>Berhasil import <strong>{inserted.toLocaleString('id-ID')}</strong> lokasi.</span>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="mt-4 flex items-center gap-2 text-sm text-red-500">
            <AlertCircle size={16} />
            <span>Import gagal. Periksa koneksi dan coba lagi.</span>
          </div>
        )}

        {/* Error log */}
        {errLog.length > 0 && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs font-semibold text-amber-700 mb-1">
              {errLog.length} error (data lain tetap tersimpan):
            </p>
            <ul className="text-xs text-amber-600 space-y-0.5 max-h-24 overflow-y-auto">
              {errLog.slice(0, 20).map((e, i) => <li key={i}>• {e}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
