// Tipe & helper yang dipakai BERSAMA oleh TitipJualPage (StepProperti) dan
// StepDataDiri. Dipisah 2026-09-27 saat StepDataDiri dipindah ke berkasnya
// sendiri supaya bisa dimuat malas — lihat komentar di TitipJualPage.tsx.

export interface Stage2Result {
  kode_perjanjian: string;
  kode_listing: string;
  property_id: number;
  owner_id: number;
  agreement_id: number;
  event_id?: string;
  duplikat?: boolean;
  pesan?: string;
}

/**
 * Apakah objek isian punya nilai yang berarti? Dipakai sebagai rem autosave:
 * tanpa ini, effect autosave menulis objek kosong ~800 ms setelah halaman
 * dibuka, sehingga bacaDraft() selalu mengembalikan sesuatu dan banner
 * "isian dipulihkan" muncul pada pengunjung yang belum mengetik apa pun.
 */
export function adaIsi(obj: Record<string, unknown>): boolean {
  return Object.values(obj).some(v =>
    typeof v === 'string' ? v.trim() !== '' : typeof v === 'number' ? true : v === true);
}

export const inputCls = (err?: string) =>
  `w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565C0] transition-all ${err ? 'border-red-400 bg-red-50' : 'border-gray-200'}`;

export function FieldErr({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-red-500 text-xs mt-1">{msg}</p>;
}
