import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { X, Download, Upload, CheckCircle, AlertCircle, FileText } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedRow {
  title?: string;
  jenis_properti?: string;
  tujuan?: string;
  harga?: string;
  provinsi?: string;
  kabupaten?: string;
  kecamatan?: string;
  kelurahan?: string;
  luas_tanah?: string;
  luas_bangunan?: string;
  jumlah_kamar_tidur?: string;
  jumlah_kamar_mandi?: string;
  legalitas?: string;
  deskripsi?: string;
  nego?: string;
  nett?: string;
  [key: string]: string | undefined;
}

interface BatchError { row: number; field: string; message: string; }
interface InsertedRow  { id: number; kode_listing: string; image_urls: string[]; }

const CSV_HEADERS = 'title,jenis_properti,tujuan,harga,provinsi,kabupaten,kecamatan,kelurahan,luas_tanah,luas_bangunan,jumlah_kamar_tidur,jumlah_kamar_mandi,legalitas,deskripsi,nego,nett,badge_premium,badge_featured,badge_hot,status_sold,image_url1,image_url2,image_url3,image_url4,image_url5';

const VALID_JENIS  = new Set(['apartment','rumah','tanah','kost','hotel','homestay','villa','ruko','gudang','komersial']);
const VALID_TUJUAN = new Set(['dijual','disewa','dijual_disewa']);

const PREVIEW_COLS = ['title','jenis_properti','tujuan','harga','kabupaten','kecamatan'];

function rowError(r: ParsedRow): string | null {
  if (!r.title?.trim()) return 'title kosong';
  if (!VALID_JENIS.has(r.jenis_properti ?? '')) return `jenis_properti tidak valid: "${r.jenis_properti}"`;
  if (!VALID_TUJUAN.has(r.tujuan ?? '')) return `tujuan tidak valid: "${r.tujuan}"`;
  const h = Number(r.harga);
  if (isNaN(h) || h < 0) return `harga bukan angka: "${r.harga}"`;
  return null;
}

function downloadTemplate() {
  const example1 = 'Rumah Minimalis 3 Kamar Dekat UGM,rumah,dijual,850000000,DI Yogyakarta,Kabupaten Sleman,Depok,Caturtunggal,120,90,3,2,SHM & IMB/PBG Lengkap,Rumah minimalis modern dekat kampus UGM. Lingkungan tenang dan nyaman.,0,0,0,0,0,0,,,,,';
  const example2 = 'Tanah Kavling Strategis Bantul,tanah,dijual,450000000,DI Yogyakarta,Kabupaten Bantul,Sewon,Pendowoharjo,200,,,,Girik/Letter C/PPJB/dll,Tanah kavling siap bangun. Akses jalan lebar 6 meter.,1,0,0,0,0,0,,,,,';
  const csv = [CSV_HEADERS, example1, example2].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'template_import_properti.csv'; a.click();
  URL.revokeObjectURL(url);
}

export default function CsvImportModal({ isOpen, onClose, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows]         = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading]       = useState(false);
  const [photoProgress, setPhotoProgress] = useState('');
  const [result, setResult]         = useState<{ inserted: number; errors: BatchError[]; total: number; photos_ok: number; photos_fail: number } | null>(null);
  const [parseErr, setParseErr]     = useState('');

  if (!isOpen) return null;

  const reset = () => {
    setRows([]); setFileName(''); setResult(null); setParseErr('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setParseErr('File harus berformat .csv'); return;
    }
    setParseErr(''); setRows([]); setResult(null);
    setFileName(file.name);

    Papa.parse<ParsedRow>(file, {
      header: true,
      delimiter: '',
      skipEmptyLines: true,
      skipFirstNLines: 0,
      encoding: 'UTF-8',
      transformHeader: h => h.trim().replace(/^﻿/, ''),
      complete: res => {
        if (res.errors.length && res.data.length === 0) {
          setParseErr('Gagal parse CSV: ' + res.errors[0]?.message); return;
        }
        setRows(res.data);
      },
      error: err => setParseErr('Gagal membaca file: ' + err.message),
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    setLoading(true);
    setPhotoProgress('');
    try {
      // Phase 1: batch insert properti
      const res = await fetch('/api/admin/properties/batch', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!data.success) { setParseErr(data.error ?? 'Import gagal'); return; }

      const batchResult = data.data as { inserted: number; errors: BatchError[]; total: number; inserted_rows: InsertedRow[] };
      if (batchResult.inserted > 0) onSuccess();

      // Phase 2: upload foto per properti (satu per satu)
      const withPhotos = (batchResult.inserted_rows ?? []).filter(r => r.image_urls.length > 0);
      let photos_ok = 0, photos_fail = 0;
      for (let ri = 0; ri < withPhotos.length; ri++) {
        const prop = withPhotos[ri];
        setPhotoProgress(`Mengupload foto properti [${ri + 1}/${withPhotos.length}]...`);
        for (const url of prop.image_urls) {
          try {
            const fRes = await fetch(`/api/admin/properties/${prop.id}/photos`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ photo_url: url }),
            });
            fRes.ok ? photos_ok++ : photos_fail++;
          } catch { photos_fail++; }
        }
      }

      setResult({ inserted: batchResult.inserted, errors: batchResult.errors, total: batchResult.total, photos_ok, photos_fail });
    } catch {
      setParseErr('Koneksi ke server gagal');
    } finally {
      setLoading(false);
      setPhotoProgress('');
    }
  };

  const preview = rows.slice(0, 5);
  const clientErrors = rows.map((r, i) => ({ row: i + 1, err: rowError(r) })).filter(x => x.err !== null);
  const canImport = rows.length > 0 && !loading && !result;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-[#1565C0]" />
            <h2 className="font-display font-semibold text-[#0F172A]">Import CSV Properti</h2>
          </div>
          <button onClick={() => { reset(); onClose(); }} className="p-1.5 text-[#94A3B8] hover:text-[#374151] rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Template download */}
          <div className="flex items-center justify-between bg-[#F0F7FF] rounded-xl p-3">
            <span className="text-sm text-[#1565C0]">Belum punya template? Download dulu — isi lalu upload.</span>
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1565C0] text-white text-xs font-semibold rounded-lg hover:bg-[#1565C0]/90"
            >
              <Download size={13} /> Template CSV
            </button>
          </div>

          {/* Drop zone */}
          {!result && (
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-[#1565C0]/50 transition-colors cursor-pointer"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={28} className="text-[#94A3B8] mx-auto mb-2" />
              <p className="text-sm text-[#374151] font-medium">{fileName || 'Klik atau drag & drop file CSV'}</p>
              <p className="text-xs text-[#94A3B8] mt-1">Mendukung file dari Excel (.csv, UTF-8 / BOM)</p>
              <input
                ref={fileRef} type="file" accept=".csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          )}

          {/* Parse error */}
          {parseErr && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span>{parseErr}</span>
            </div>
          )}

          {/* Preview */}
          {rows.length > 0 && !result && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[#0F172A]">
                  Preview <span className="text-[#64748B] font-normal">({rows.length} baris ditemukan — menampilkan 5 pertama)</span>
                </p>
                {clientErrors.length > 0 && (
                  <span className="text-xs text-red-600 font-medium">{clientErrors.length} baris berpotensi error</span>
                )}
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-3 py-2 text-left text-[#64748B] font-semibold">#</th>
                      {PREVIEW_COLS.map(c => (
                        <th key={c} className="px-3 py-2 text-left text-[#64748B] font-semibold whitespace-nowrap">{c}</th>
                      ))}
                      <th className="px-3 py-2 text-left text-[#64748B] font-semibold">status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.map((r, i) => {
                      const err = rowError(r);
                      return (
                        <tr key={i} className={err ? 'bg-red-50' : ''}>
                          <td className="px-3 py-2 text-[#94A3B8]">{i + 1}</td>
                          {PREVIEW_COLS.map(c => (
                            <td key={c} className="px-3 py-2 text-[#374151] max-w-[120px] truncate">{r[c] ?? '—'}</td>
                          ))}
                          <td className="px-3 py-2">
                            {err
                              ? <span className="text-red-600 font-medium">{err}</span>
                              : <span className="text-emerald-600 font-medium">✓ valid</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {clientErrors.length > 0 && (
                <p className="text-xs text-[#64748B]">
                  Baris bermasalah akan dilewati, baris lain tetap diimport (partial import).
                </p>
              )}
            </div>
          )}

          {/* Hasil import */}
          {result && (
            <div className="space-y-4">
              <div className={`flex items-start gap-3 rounded-xl p-4 ${
                result.inserted > 0 ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'
              }`}>
                <CheckCircle size={18} className={result.inserted > 0 ? 'text-green-600 mt-0.5' : 'text-yellow-600 mt-0.5'} />
                <div>
                  <p className="font-semibold text-sm text-[#0F172A]">
                    Berhasil import {result.inserted} dari {result.total} properti
                  </p>
                  {result.photos_ok > 0 && (
                    <p className="text-xs text-[#64748B] mt-0.5">{result.photos_ok} foto berhasil diupload{result.photos_fail > 0 ? `, ${result.photos_fail} gagal` : ''}</p>
                  )}
                  {result.errors.length > 0 && (
                    <p className="text-xs text-[#64748B] mt-0.5">{result.errors.length} baris gagal — lihat detail di bawah</p>
                  )}
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-red-100">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-red-50 border-b border-red-100">
                        <th className="px-3 py-2 text-left text-[#64748B] font-semibold">Baris</th>
                        <th className="px-3 py-2 text-left text-[#64748B] font-semibold">Kolom</th>
                        <th className="px-3 py-2 text-left text-[#64748B] font-semibold">Alasan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-50">
                      {result.errors.map((e, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-[#EF4444] font-semibold">{e.row}</td>
                          <td className="px-3 py-2 text-[#374151]">{e.field}</td>
                          <td className="px-3 py-2 text-[#374151]">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-gray-100">
          <button
            onClick={() => { reset(); if (result) onClose(); }}
            className="px-4 py-2 text-sm text-[#64748B] hover:text-[#374151] rounded-xl hover:bg-gray-100 transition-colors"
          >
            {result ? 'Tutup' : 'Batal'}
          </button>

          <div className="flex items-center gap-2">
            {result && (
              <button
                onClick={reset}
                className="px-4 py-2 text-sm font-semibold text-[#1565C0] border border-[#1565C0]/30 rounded-xl hover:bg-[#F0F7FF] transition-colors"
              >
                Import Lagi
              </button>
            )}
            {!result && (
              <button
                onClick={handleImport}
                disabled={!canImport}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#1565C0] rounded-xl hover:bg-[#1565C0]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (photoProgress || 'Mengimport…') : <><Upload size={14} /> Import Sekarang ({rows.length} baris)</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
